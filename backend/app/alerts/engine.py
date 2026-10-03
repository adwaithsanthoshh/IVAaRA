"""
IVaaRA – Alert Engine
Deterministic rule-based alert generation with debouncing/cooldown.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Alert, Device
from app.schemas.schemas import TelemetryPayload

logger = logging.getLogger(__name__)

# Alert type constants
FLOW_TOO_LOW = "FLOW_TOO_LOW"
FLOW_TOO_HIGH = "FLOW_TOO_HIGH"
FLOW_STOPPED = "FLOW_STOPPED"
TEMPERATURE_ABNORMAL = "TEMPERATURE_ABNORMAL"
DEVICE_OFFLINE = "DEVICE_OFFLINE"
SENSOR_FAILURE = "SENSOR_FAILURE"
LOW_REMAINING_VOLUME = "LOW_REMAINING_VOLUME"
CONTROL_FAILURE = "CONTROL_FAILURE"

# Severity constants
INFO = "INFO"
WARNING = "WARNING"
CRITICAL = "CRITICAL"

# Cooldown: minimum seconds before generating the same alert type again per device
ALERT_COOLDOWN_SECONDS: Dict[str, int] = {
    FLOW_TOO_LOW: 60,
    FLOW_TOO_HIGH: 60,
    FLOW_STOPPED: 30,
    TEMPERATURE_ABNORMAL: 120,
    DEVICE_OFFLINE: 60,
    SENSOR_FAILURE: 120,
    LOW_REMAINING_VOLUME: 300,
    CONTROL_FAILURE: 60,
}

# In-memory cooldown tracker: {(device_id, alert_type): last_fired_at}
_cooldown_tracker: Dict[Tuple[str, str], datetime] = {}


def _check_cooldown(device_id: str, alert_type: str) -> bool:
    """Returns True if the alert can fire (cooldown elapsed or first time)."""
    key = (device_id, alert_type)
    now = datetime.now(timezone.utc)
    last = _cooldown_tracker.get(key)
    cooldown = ALERT_COOLDOWN_SECONDS.get(alert_type, 60)
    if last is None or (now - last).total_seconds() >= cooldown:
        _cooldown_tracker[key] = now
        return True
    return False


def _reset_cooldown(device_id: str, alert_type: str) -> None:
    """Remove cooldown entry (e.g. when alert resolves)."""
    _cooldown_tracker.pop((device_id, alert_type), None)


async def _get_device_db_id(session: AsyncSession, device_id: str) -> Optional[str]:
    result = await session.execute(
        select(Device.id).where(Device.device_id == device_id)
    )
    row = result.scalar_one_or_none()
    return row


async def _has_active_alert(
    session: AsyncSession, device_db_id: str, alert_type: str
) -> bool:
    result = await session.execute(
        select(Alert.id)
        .where(Alert.device_id == device_db_id)
        .where(Alert.alert_type == alert_type)
        .where(Alert.status == "ACTIVE")
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _create_alert(
    session: AsyncSession,
    device_db_id: str,
    alert_type: str,
    severity: str,
    message: str,
    action_taken: Optional[str] = None,
) -> Alert:
    alert = Alert(
        device_id=device_db_id,
        alert_type=alert_type,
        severity=severity,
        message=message,
        status="ACTIVE",
        action_taken=action_taken,
    )
    session.add(alert)
    await session.flush()
    return alert


async def _resolve_alert(
    session: AsyncSession, device_db_id: str, alert_type: str
) -> None:
    result = await session.execute(
        select(Alert)
        .where(Alert.device_id == device_db_id)
        .where(Alert.alert_type == alert_type)
        .where(Alert.status == "ACTIVE")
    )
    for alert in result.scalars().all():
        alert.status = "RESOLVED"
        alert.resolved_at = datetime.now(timezone.utc)
    await session.flush()


async def evaluate_telemetry(
    session: AsyncSession,
    telemetry: TelemetryPayload,
    target_flow: Optional[float],
) -> list[dict]:
    """
    Evaluate incoming telemetry against safety rules.
    Returns list of new alert dicts (for WebSocket broadcast).
    """
    device_db_id = await _get_device_db_id(session, telemetry.device_id)
    if device_db_id is None:
        return []

    new_alerts: list[dict] = []

    # ── Sensor failure ──────────────────────────────────────
    if telemetry.sensor_status in ("ERROR", "DEGRADED"):
        if _check_cooldown(telemetry.device_id, SENSOR_FAILURE):
            if not await _has_active_alert(session, device_db_id, SENSOR_FAILURE):
                alert = await _create_alert(
                    session, device_db_id, SENSOR_FAILURE, WARNING,
                    f"Sensor status: {telemetry.sensor_status}. Verify hardware connections."
                )
                new_alerts.append(_alert_to_dict(alert, telemetry.device_id))
    else:
        await _resolve_alert(session, device_db_id, SENSOR_FAILURE)
        _reset_cooldown(telemetry.device_id, SENSOR_FAILURE)

    # ── Flow stopped ────────────────────────────────────────
    if telemetry.flow_rate is not None and telemetry.flow_rate < 1.0:
        if _check_cooldown(telemetry.device_id, FLOW_STOPPED):
            if not await _has_active_alert(session, device_db_id, FLOW_STOPPED):
                alert = await _create_alert(
                    session, device_db_id, FLOW_STOPPED, CRITICAL,
                    f"Flow has stopped (measured: {telemetry.flow_rate:.1f} drops/min). Immediate check required.",
                    "Emergency flow control initiated."
                )
                new_alerts.append(_alert_to_dict(alert, telemetry.device_id))
    else:
        await _resolve_alert(session, device_db_id, FLOW_STOPPED)
        _reset_cooldown(telemetry.device_id, FLOW_STOPPED)

    # ── Flow too low / too high ─────────────────────────────
    if target_flow and telemetry.flow_rate is not None and telemetry.flow_rate >= 1.0:
        deviation = telemetry.flow_rate - target_flow
        deviation_pct = abs(deviation) / target_flow * 100 if target_flow > 0 else 0

        if deviation_pct > 20 and telemetry.flow_rate < target_flow:
            if _check_cooldown(telemetry.device_id, FLOW_TOO_LOW):
                if not await _has_active_alert(session, device_db_id, FLOW_TOO_LOW):
                    alert = await _create_alert(
                        session, device_db_id, FLOW_TOO_LOW, WARNING,
                        f"Flow rate {telemetry.flow_rate:.1f} drops/min is {deviation_pct:.0f}% below target {target_flow:.1f}."
                    )
                    new_alerts.append(_alert_to_dict(alert, telemetry.device_id))
        else:
            await _resolve_alert(session, device_db_id, FLOW_TOO_LOW)
            _reset_cooldown(telemetry.device_id, FLOW_TOO_LOW)

        if deviation_pct > 20 and telemetry.flow_rate > target_flow:
            if _check_cooldown(telemetry.device_id, FLOW_TOO_HIGH):
                if not await _has_active_alert(session, device_db_id, FLOW_TOO_HIGH):
                    alert = await _create_alert(
                        session, device_db_id, FLOW_TOO_HIGH, WARNING,
                        f"Flow rate {telemetry.flow_rate:.1f} drops/min is {deviation_pct:.0f}% above target {target_flow:.1f}."
                    )
                    new_alerts.append(_alert_to_dict(alert, telemetry.device_id))
        else:
            await _resolve_alert(session, device_db_id, FLOW_TOO_HIGH)
            _reset_cooldown(telemetry.device_id, FLOW_TOO_HIGH)

    # ── Temperature abnormal ────────────────────────────────
    if telemetry.temperature is not None:
        if telemetry.temperature < 35.0 or telemetry.temperature > 46.0:
            if _check_cooldown(telemetry.device_id, TEMPERATURE_ABNORMAL):
                if not await _has_active_alert(session, device_db_id, TEMPERATURE_ABNORMAL):
                    alert = await _create_alert(
                        session, device_db_id, TEMPERATURE_ABNORMAL, WARNING,
                        f"Line temperature {telemetry.temperature:.1f}°C is outside normal range (35–46°C)."
                    )
                    new_alerts.append(_alert_to_dict(alert, telemetry.device_id))
        else:
            await _resolve_alert(session, device_db_id, TEMPERATURE_ABNORMAL)
            _reset_cooldown(telemetry.device_id, TEMPERATURE_ABNORMAL)

    # ── Low remaining volume ────────────────────────────────
    if telemetry.remaining_volume_ml is not None and telemetry.remaining_volume_ml < 50:
        if _check_cooldown(telemetry.device_id, LOW_REMAINING_VOLUME):
            if not await _has_active_alert(session, device_db_id, LOW_REMAINING_VOLUME):
                sev = CRITICAL if telemetry.remaining_volume_ml < 20 else WARNING
                alert = await _create_alert(
                    session, device_db_id, LOW_REMAINING_VOLUME, sev,
                    f"Remaining IV volume critical: {telemetry.remaining_volume_ml:.0f} mL. Bag replacement needed."
                )
                new_alerts.append(_alert_to_dict(alert, telemetry.device_id))
    else:
        await _resolve_alert(session, device_db_id, LOW_REMAINING_VOLUME)
        _reset_cooldown(telemetry.device_id, LOW_REMAINING_VOLUME)

    return new_alerts


async def create_device_offline_alert(
    session: AsyncSession, device_id: str, device_db_id: str
) -> Optional[dict]:
    if _check_cooldown(device_id, DEVICE_OFFLINE):
        if not await _has_active_alert(session, device_db_id, DEVICE_OFFLINE):
            alert = await _create_alert(
                session, device_db_id, DEVICE_OFFLINE, CRITICAL,
                f"Device {device_id} has not sent telemetry within the timeout window. Device may be offline."
            )
            return _alert_to_dict(alert, device_id)
    return None


async def resolve_device_offline_alert(
    session: AsyncSession, device_db_id: str, device_id: str
) -> None:
    await _resolve_alert(session, device_db_id, DEVICE_OFFLINE)
    _reset_cooldown(device_id, DEVICE_OFFLINE)


def _alert_to_dict(alert: Alert, device_id: str) -> dict:
    return {
        "id": alert.id,
        "device_id": device_id,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "message": alert.message,
        "timestamp": alert.timestamp.isoformat(),
        "status": alert.status,
        "action_taken": alert.action_taken,
    }
