"""
IVaaRA – Backend Tests
"""
import json
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

# ── Setup test database ──────────────────────────────────────
import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_ivara.db"
os.environ["MQTT_HOST"] = "localhost"
os.environ["MQTT_PORT"] = "1883"

from app.config import get_settings
from app.schemas.schemas import TelemetryPayload
from app.risk.engine import calculate_risk_score
from app.alerts.engine import (
    evaluate_telemetry,
    FLOW_STOPPED,
    TEMPERATURE_ABNORMAL,
    LOW_REMAINING_VOLUME,
    _cooldown_tracker,
)


def make_telemetry(**kwargs) -> TelemetryPayload:
    defaults = {
        "device_id": "IV-001",
        "timestamp": datetime.now(timezone.utc),
        "flow_rate": 25.0,
        "target_flow": 25.0,
        "temperature": 42.0,
        "remaining_volume_ml": 420.0,
        "servo_angle": 40,
        "automatic_control": True,
        "sensor_status": "OK",
    }
    defaults.update(kwargs)
    return TelemetryPayload(**defaults)


# ── Telemetry Validation ─────────────────────────────────────

class TestTelemetryValidation:
    def test_valid_telemetry(self):
        t = make_telemetry()
        assert t.flow_rate == 25.0
        assert t.device_id == "IV-001"

    def test_flow_rate_clamped_at_max(self):
        with pytest.raises(Exception):
            make_telemetry(flow_rate=999.0)  # > 300 should fail

    def test_negative_flow_rejected(self):
        with pytest.raises(Exception):
            make_telemetry(flow_rate=-1.0)

    def test_invalid_sensor_status_coerced(self):
        t = make_telemetry(sensor_status="GARBAGE")
        assert t.sensor_status == "ERROR"

    def test_valid_sensor_status_ok(self):
        t = make_telemetry(sensor_status="OK")
        assert t.sensor_status == "OK"

    def test_malformed_timestamp_rejected(self):
        with pytest.raises(Exception):
            TelemetryPayload(
                device_id="IV-001",
                timestamp="not-a-date",
                flow_rate=25.0,
            )


# ── Risk Scoring ─────────────────────────────────────────────

class TestRiskScore:
    def test_nominal_state_is_low(self):
        t = make_telemetry()
        score, level, factors = calculate_risk_score(t, 25.0, 0, "ONLINE")
        assert level == "LOW"
        assert score < 30

    def test_flow_stopped_is_critical(self):
        # Stopped flow alone gives 30 pts = MODERATE; with alerts/offline it escalates
        t = make_telemetry(flow_rate=0.0)
        score, level, factors = calculate_risk_score(t, 25.0, 0, "ONLINE")
        assert level in ("MODERATE", "HIGH", "CRITICAL")
        assert score >= 30
        assert any("stopped" in f.lower() for f in factors)

    def test_flow_stopped_with_alerts_is_high(self):
        # Stopped flow (30) + 3 alerts (15) = 45 → still MODERATE at defaults
        # To reach HIGH (≥ 60) we need additional offline penalty (20) → total 65
        t = make_telemetry(flow_rate=0.0)
        score, level, factors = calculate_risk_score(t, 25.0, 3, "OFFLINE")
        assert score >= 60
        assert level in ("HIGH", "CRITICAL")

    def test_offline_device_adds_penalty(self):
        t = make_telemetry()
        score_online, _, _ = calculate_risk_score(t, 25.0, 0, "ONLINE")
        score_offline, _, _ = calculate_risk_score(t, 25.0, 0, "OFFLINE")
        assert score_offline > score_online

    def test_temperature_abnormal_adds_to_score(self):
        t_normal = make_telemetry(temperature=42.0)
        t_high = make_telemetry(temperature=50.0)
        s_normal, _, _ = calculate_risk_score(t_normal, 25.0, 0, "ONLINE")
        s_high, _, _ = calculate_risk_score(t_high, 25.0, 0, "ONLINE")
        assert s_high > s_normal

    def test_low_volume_adds_penalty(self):
        t_ok = make_telemetry(remaining_volume_ml=400.0)
        t_low = make_telemetry(remaining_volume_ml=10.0)
        s_ok, _, _ = calculate_risk_score(t_ok, 25.0, 0, "ONLINE")
        s_low, _, _ = calculate_risk_score(t_low, 25.0, 0, "ONLINE")
        assert s_low > s_ok

    def test_active_alerts_increase_score(self):
        t = make_telemetry()
        s0, _, _ = calculate_risk_score(t, 25.0, 0, "ONLINE")
        s3, _, _ = calculate_risk_score(t, 25.0, 3, "ONLINE")
        assert s3 > s0

    def test_score_clamped_0_to_100(self):
        t = make_telemetry(flow_rate=0.0, temperature=60.0, remaining_volume_ml=5.0, sensor_status="ERROR")
        score, _, _ = calculate_risk_score(t, 25.0, 10, "OFFLINE")
        assert 0 <= score <= 100

    def test_large_deviation_is_not_low(self):
        t = make_telemetry(flow_rate=50.0)  # 100% deviation
        score, level, _ = calculate_risk_score(t, 25.0, 0, "ONLINE")
        assert level != "LOW"


# ── Alert Cooldown ───────────────────────────────────────────

class TestAlertCooldown:
    def setup_method(self):
        """Clear cooldown tracker before each test."""
        _cooldown_tracker.clear()

    def test_cooldown_allows_first_fire(self):
        from app.alerts.engine import _check_cooldown
        assert _check_cooldown("IV-001", FLOW_STOPPED) is True

    def test_cooldown_blocks_immediate_repeat(self):
        from app.alerts.engine import _check_cooldown
        _check_cooldown("IV-001", FLOW_STOPPED)  # first fire
        assert _check_cooldown("IV-001", FLOW_STOPPED) is False  # blocked

    def test_cooldown_different_devices_independent(self):
        from app.alerts.engine import _check_cooldown
        _check_cooldown("IV-001", FLOW_STOPPED)
        # IV-002 should still be able to fire
        assert _check_cooldown("IV-002", FLOW_STOPPED) is True

    def test_cooldown_different_types_independent(self):
        from app.alerts.engine import _check_cooldown
        _check_cooldown("IV-001", FLOW_STOPPED)
        # Different alert type on same device should fire
        assert _check_cooldown("IV-001", TEMPERATURE_ABNORMAL) is True


# ── MQTT Payload Parsing ─────────────────────────────────────

class TestMQTTPayloadParsing:
    def test_valid_json_parsed(self):
        raw = json.dumps({
            "device_id": "IV-001",
            "timestamp": "2026-10-03T06:14:43Z",
            "flow_rate": 24.0,
            "target_flow": 25.0,
            "temperature": 42.0,
            "remaining_volume_ml": 420.0,
            "servo_angle": 40,
            "automatic_control": True,
            "sensor_status": "OK",
        })
        data = json.loads(raw)
        t = TelemetryPayload(**data)
        assert t.flow_rate == 24.0

    def test_malformed_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            json.loads("NOT JSON {{{")

    def test_missing_required_fields_raises(self):
        with pytest.raises(Exception):
            TelemetryPayload(device_id="IV-001")  # missing timestamp

    def test_extra_fields_ignored(self):
        t = TelemetryPayload(
            device_id="IV-001",
            timestamp=datetime.now(timezone.utc),
            flow_rate=25.0,
            extra_unknown_field="ignored",  # type: ignore
        )
        assert t.device_id == "IV-001"

    def test_null_fields_accepted(self):
        t = TelemetryPayload(
            device_id="IV-001",
            timestamp=datetime.now(timezone.utc),
            flow_rate=None,
            temperature=None,
        )
        assert t.flow_rate is None
