"""
IVaaRA – SQLAlchemy Database Models
FIX: Use timezone-aware UTC datetimes consistently.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    # FIX: was datetime.utcnow() (naive) — now timezone-aware UTC
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────────────────────
# Device
# ─────────────────────────────────────────────────────────────
class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    bed_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("beds.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="OFFLINE")  # ONLINE/OFFLINE/ERROR
    firmware_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    mqtt_topic_prefix: Mapped[str] = mapped_column(String(128), nullable=False)
    iv_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    initial_volume_ml: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    # Relationships
    bed: Mapped[Optional["Bed"]] = relationship("Bed", back_populates="devices")
    telemetry: Mapped[list["Telemetry"]] = relationship("Telemetry", back_populates="device", cascade="all, delete-orphan")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="device", cascade="all, delete-orphan")
    risk_assessments: Mapped[list["RiskAssessment"]] = relationship("RiskAssessment", back_populates="device", cascade="all, delete-orphan")
    events: Mapped[list["DeviceEvent"]] = relationship("DeviceEvent", back_populates="device", cascade="all, delete-orphan")
    calibrations: Mapped[list["FlowCalibration"]] = relationship("FlowCalibration", back_populates="device", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────
# Bed / Patient
# ─────────────────────────────────────────────────────────────
class Bed(Base):
    __tablename__ = "beds"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    bed_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    ward: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    patient_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    devices: Mapped[list["Device"]] = relationship("Device", back_populates="bed")


# ─────────────────────────────────────────────────────────────
# IV Session
# ─────────────────────────────────────────────────────────────
class IVSession(Base):
    __tablename__ = "iv_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"), nullable=False, index=True)
    iv_type: Mapped[str] = mapped_column(String(64), nullable=False)
    initial_volume_ml: Mapped[float] = mapped_column(Float, nullable=False)
    target_flow_drops_per_min: Mapped[float] = mapped_column(Float, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")  # ACTIVE/COMPLETED/ABORTED
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ─────────────────────────────────────────────────────────────
# Telemetry
# ─────────────────────────────────────────────────────────────
class Telemetry(Base):
    __tablename__ = "telemetry"
    __table_args__ = (
        Index("ix_telemetry_device_ts", "device_id", "timestamp"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    flow_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)        # drops/min
    target_flow: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # °C
    remaining_volume_ml: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    servo_angle: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    automatic_control: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    sensor_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # OK/ERROR/DEGRADED

    device: Mapped["Device"] = relationship("Device", back_populates="telemetry")


# ─────────────────────────────────────────────────────────────
# Alert
# ─────────────────────────────────────────────────────────────
class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_device_status", "device_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(32), nullable=False)   # FLOW_TOO_LOW etc.
    severity: Mapped[str] = mapped_column(String(8), nullable=False)      # INFO/WARNING/CRITICAL
    message: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")     # ACTIVE/ACKNOWLEDGED/RESOLVED
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    action_taken: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    device: Mapped["Device"] = relationship("Device", back_populates="alerts")


# ─────────────────────────────────────────────────────────────
# Risk Assessment
# ─────────────────────────────────────────────────────────────
class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    __table_args__ = (
        Index("ix_risk_device_ts", "device_id", "timestamp"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)   # 0-100
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False) # LOW/MODERATE/HIGH/CRITICAL
    contributing_factors: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    llm_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    device: Mapped["Device"] = relationship("Device", back_populates="risk_assessments")


# ─────────────────────────────────────────────────────────────
# Device Event (commands, stops, mode changes)
# ─────────────────────────────────────────────────────────────
class DeviceEvent(Base):
    __tablename__ = "device_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)  # COMMAND/STATUS_CHANGE/EMERGENCY_STOP
    payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    status: Mapped[str] = mapped_column(String(16), default="PENDING")   # PENDING/ACKNOWLEDGED/FAILED
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    operator: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    device: Mapped["Device"] = relationship("Device", back_populates="events")


# ─────────────────────────────────────────────────────────────
# Flow Calibration
# ─────────────────────────────────────────────────────────────
class FlowCalibration(Base):
    __tablename__ = "flow_calibrations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"), nullable=False, index=True)
    servo_angle: Mapped[int] = mapped_column(Integer, nullable=False)
    measured_flow_rate: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    notes: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    device: Mapped["Device"] = relationship("Device", back_populates="calibrations")


# ─────────────────────────────────────────────────────────────
# System Configuration
# ─────────────────────────────────────────────────────────────
class SystemConfiguration(Base):
    __tablename__ = "system_configuration"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
