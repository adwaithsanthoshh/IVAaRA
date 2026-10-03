"""
IVaaRA – Risk Scoring Engine
Transparent, deterministic risk score calculation (0-100).
The LLM can add summaries on top but NEVER controls the score.
"""
import json
import logging
from datetime import datetime
from typing import List, Optional, Tuple

from app.config import get_settings
from app.schemas.schemas import TelemetryPayload

logger = logging.getLogger(__name__)


def _clamp(value: float, min_v: float = 0.0, max_v: float = 100.0) -> float:
    return max(min_v, min(max_v, value))


def calculate_risk_score(
    telemetry: TelemetryPayload,
    target_flow: Optional[float],
    active_alert_count: int = 0,
    device_status: str = "ONLINE",
) -> Tuple[int, str, List[str]]:
    """
    Returns: (score: int, level: str, factors: List[str])
    """
    settings = get_settings()
    score = 0.0
    factors: List[str] = []

    # ── Device connectivity (0-20 pts) ──────────────────────
    if device_status == "OFFLINE":
        score += 20
        factors.append("Device offline – no telemetry")
    elif device_status == "ERROR":
        score += 10
        factors.append("Device reporting error state")

    # ── Sensor failure (0-15 pts) ───────────────────────────
    if telemetry.sensor_status in ("ERROR", "DEGRADED"):
        pts = 15 if telemetry.sensor_status == "ERROR" else 8
        score += pts
        factors.append(f"Sensor status: {telemetry.sensor_status}")

    # ── Flow deviation (0-30 pts) ───────────────────────────
    if telemetry.flow_rate is not None:
        if telemetry.flow_rate < 1.0:
            score += 30
            factors.append("Flow stopped (< 1 drop/min)")
        elif target_flow and target_flow > 0:
            deviation_pct = abs(telemetry.flow_rate - target_flow) / target_flow * 100
            if deviation_pct > 30:
                pts = _clamp(deviation_pct * 0.5, 0, 30)
                score += pts
                factors.append(f"Flow deviation {deviation_pct:.0f}% from target")
            elif deviation_pct > 20:
                pts = _clamp(deviation_pct * 0.3, 0, 20)
                score += pts
                factors.append(f"Moderate flow deviation {deviation_pct:.0f}%")

    # ── Temperature (0-15 pts) ──────────────────────────────
    if telemetry.temperature is not None:
        if telemetry.temperature < 35.0 or telemetry.temperature > 46.0:
            deviation = abs(telemetry.temperature - 40.5)  # midpoint
            pts = _clamp(deviation * 2, 5, 15)
            score += pts
            factors.append(f"Temperature abnormal: {telemetry.temperature:.1f}°C")

    # ── Remaining volume (0-10 pts) ─────────────────────────
    if telemetry.remaining_volume_ml is not None:
        if telemetry.remaining_volume_ml < 20:
            score += 10
            factors.append(f"Critical low volume: {telemetry.remaining_volume_ml:.0f} mL")
        elif telemetry.remaining_volume_ml < 50:
            score += 5
            factors.append(f"Low remaining volume: {telemetry.remaining_volume_ml:.0f} mL")

    # ── Active alerts penalty (0-15 pts) ───────────────────
    if active_alert_count > 0:
        pts = _clamp(active_alert_count * 5, 0, 15)
        score += pts
        factors.append(f"{active_alert_count} active alert(s)")

    final_score = int(_clamp(score))

    # Determine level
    if final_score >= settings.risk_threshold_high:
        level = "CRITICAL"
    elif final_score >= settings.risk_threshold_moderate:
        level = "HIGH"
    elif final_score >= settings.risk_threshold_low:
        level = "MODERATE"
    else:
        level = "LOW"

    return final_score, level, factors
