"""
IVaaRA – Pydantic Schemas for API request/response validation
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────────
# Telemetry
# ─────────────────────────────────────────────────────────────
class TelemetryPayload(BaseModel):
    """Incoming MQTT telemetry from ESP32."""
    device_id: str
    timestamp: datetime
    flow_rate: Optional[float] = Field(None, ge=0, le=300)
    target_flow: Optional[float] = Field(None, ge=0, le=300)
    temperature: Optional[float] = Field(None, ge=-40, le=150)
    remaining_volume_ml: Optional[float] = Field(None, ge=0, le=5000)
    servo_angle: Optional[int] = Field(None, ge=0, le=180)
    automatic_control: Optional[bool] = None
    sensor_status: Optional[str] = None

    @field_validator("sensor_status")
    @classmethod
    def validate_sensor_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("OK", "ERROR", "DEGRADED"):
            return "ERROR"
        return v


class TelemetryResponse(BaseModel):
    id: str
    device_id: str
    timestamp: datetime
    flow_rate: Optional[float]
    target_flow: Optional[float]
    temperature: Optional[float]
    remaining_volume_ml: Optional[float]
    servo_angle: Optional[int]
    automatic_control: Optional[bool]
    sensor_status: Optional[str]

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# Device
# ─────────────────────────────────────────────────────────────
class DeviceCreate(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=64)
    bed_id: Optional[str] = None
    firmware_version: Optional[str] = None
    iv_type: Optional[str] = None
    initial_volume_ml: Optional[float] = Field(None, ge=0, le=5000)


class DeviceUpdate(BaseModel):
    """Fields that can be updated via PATCH."""
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    iv_type: Optional[str] = None
    initial_volume_ml: Optional[float] = Field(None, ge=0, le=5000)
    firmware_version: Optional[str] = None


class DeviceResponse(BaseModel):
    id: str
    device_id: str
    name: str
    bed_id: Optional[str]
    status: str
    firmware_version: Optional[str]
    last_seen: Optional[datetime]
    mqtt_topic_prefix: str
    iv_type: Optional[str]
    initial_volume_ml: Optional[float]
    created_at: datetime
    updated_at: datetime
    # Denormalized from latest telemetry (populated by service)
    latest_telemetry: Optional[TelemetryResponse] = None
    latest_risk_level: Optional[str] = None
    latest_risk_score: Optional[int] = None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# Bed
# ─────────────────────────────────────────────────────────────
class BedCreate(BaseModel):
    bed_id: str
    ward: Optional[str] = None
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    notes: Optional[str] = None


class BedResponse(BaseModel):
    id: str
    bed_id: str
    ward: Optional[str]
    patient_name: Optional[str]
    patient_id: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# Alert
# ─────────────────────────────────────────────────────────────
class AlertResponse(BaseModel):
    id: str
    device_id: str
    alert_type: str
    severity: str
    message: str
    timestamp: datetime
    status: str
    acknowledged_at: Optional[datetime]
    resolved_at: Optional[datetime]
    action_taken: Optional[str]

    model_config = {"from_attributes": True}


class AlertAcknowledgeRequest(BaseModel):
    action_taken: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Risk Assessment
# ─────────────────────────────────────────────────────────────
class RiskResponse(BaseModel):
    id: str
    device_id: str
    timestamp: datetime
    risk_score: int
    risk_level: str
    contributing_factors: Optional[str]
    llm_summary: Optional[str]

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────────────────────
class EmergencyStopRequest(BaseModel):
    operator: Optional[str] = None
    reason: Optional[str] = None


class ControlModeRequest(BaseModel):
    mode: str  # AUTOMATIC / MANUAL / EMERGENCY_STOP
    target_flow: Optional[float] = Field(None, ge=0, le=300)
    servo_angle: Optional[int] = Field(None, ge=0, le=180)
    operator: Optional[str] = None

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        allowed = ("AUTOMATIC", "MANUAL", "EMERGENCY_STOP")
        if v not in allowed:
            raise ValueError(f"mode must be one of {allowed}")
        return v


class CommandResponse(BaseModel):
    event_id: str
    device_id: str
    command: str
    status: str
    timestamp: datetime


# ─────────────────────────────────────────────────────────────
# Flow Calibration
# ─────────────────────────────────────────────────────────────
class CalibrationPoint(BaseModel):
    servo_angle: int = Field(..., ge=0, le=180)
    measured_flow_rate: float = Field(..., ge=0, le=300)
    notes: Optional[str] = None


class CalibrationResponse(BaseModel):
    id: str
    device_id: str
    servo_angle: int
    measured_flow_rate: float
    created_at: datetime
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# System Status
# ─────────────────────────────────────────────────────────────
class SystemStatusResponse(BaseModel):
    backend_status: str = "OK"
    mqtt_connected: bool
    mqtt_latency_ms: Optional[float]
    total_devices: int
    online_devices: int
    offline_devices: int
    active_alerts: int
    critical_alerts: int
    timestamp: datetime


# ─────────────────────────────────────────────────────────────
# WebSocket messages
# ─────────────────────────────────────────────────────────────
class WSMessage(BaseModel):
    type: str   # telemetry / alert / status / device_status / risk
    device_id: Optional[str] = None
    data: Dict[str, Any]
    timestamp: datetime


# ─────────────────────────────────────────────────────────────
# Analytics
# ─────────────────────────────────────────────────────────────
class AnalyticsSummary(BaseModel):
    device_id: str
    period_hours: int
    avg_flow: Optional[float]
    min_flow: Optional[float]
    max_flow: Optional[float]
    avg_temperature: Optional[float]
    alert_count: int
    uptime_percent: Optional[float]
