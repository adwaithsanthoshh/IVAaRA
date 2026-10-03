"""
IVaaRA – Devices API Router
"""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import db_session
from app.models import Alert, Device, Telemetry, RiskAssessment, DeviceEvent, FlowCalibration
from app.mqtt.client import publish_command
from app.schemas.schemas import (
    CalibrationPoint,
    CalibrationResponse,
    CommandResponse,
    ControlModeRequest,
    DeviceCreate,
    DeviceUpdate,
    DeviceResponse,
    EmergencyStopRequest,
    TelemetryResponse,
    RiskResponse,
)

router = APIRouter(prefix="/api/devices", tags=["devices"])
logger = logging.getLogger(__name__)


async def _get_device_or_404(session: AsyncSession, device_id: str) -> Device:
    result = await session.execute(
        select(Device).where(Device.device_id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found")
    return device


async def _enrich_device(session: AsyncSession, device: Device) -> DeviceResponse:
    """Attach latest telemetry and risk to device response."""
    # Latest telemetry
    tel_result = await session.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device.id)
        .order_by(Telemetry.timestamp.desc())
        .limit(1)
    )
    latest_tel = tel_result.scalar_one_or_none()

    # Latest risk
    risk_result = await session.execute(
        select(RiskAssessment)
        .where(RiskAssessment.device_id == device.id)
        .order_by(RiskAssessment.timestamp.desc())
        .limit(1)
    )
    latest_risk = risk_result.scalar_one_or_none()

    resp = DeviceResponse.model_validate(device)
    if latest_tel:
        resp.latest_telemetry = TelemetryResponse.model_validate(latest_tel)
    if latest_risk:
        resp.latest_risk_level = latest_risk.risk_level
        resp.latest_risk_score = latest_risk.risk_score

    return resp


@router.get("", response_model=List[DeviceResponse])
async def list_devices(
    session: AsyncSession = Depends(db_session),
    status: Optional[str] = Query(None, description="Filter by status: ONLINE/OFFLINE"),
):
    query = select(Device)
    if status:
        query = query.where(Device.status == status.upper())
    result = await session.execute(query.order_by(Device.device_id))
    devices = result.scalars().all()
    return [await _enrich_device(session, d) for d in devices]


@router.post("", response_model=DeviceResponse, status_code=201)
async def create_device(
    body: DeviceCreate,
    session: AsyncSession = Depends(db_session),
):
    existing = await session.execute(
        select(Device).where(Device.device_id == body.device_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Device ID already exists")

    device = Device(
        device_id=body.device_id,
        name=body.name,
        bed_id=body.bed_id,
        firmware_version=body.firmware_version,
        iv_type=body.iv_type,
        initial_volume_ml=body.initial_volume_ml,
        mqtt_topic_prefix=f"ivara/device/{body.device_id}",
        status="OFFLINE",
    )
    session.add(device)
    await session.flush()
    return await _enrich_device(session, device)


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: str,
    session: AsyncSession = Depends(db_session),
):
    device = await _get_device_or_404(session, device_id)
    return await _enrich_device(session, device)


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: str,
    body: DeviceUpdate,
    session: AsyncSession = Depends(db_session),
):
    """Update mutable device fields (iv_type, name, etc.)."""
    device = await _get_device_or_404(session, device_id)
    if body.name is not None:
        device.name = body.name
    if body.iv_type is not None:
        device.iv_type = body.iv_type
    if body.initial_volume_ml is not None:
        device.initial_volume_ml = body.initial_volume_ml
    if body.firmware_version is not None:
        device.firmware_version = body.firmware_version
    await session.flush()
    return await _enrich_device(session, device)


@router.get("/{device_id}/telemetry", response_model=List[TelemetryResponse])
async def get_telemetry(
    device_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(db_session),
):
    device = await _get_device_or_404(session, device_id)
    result = await session.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device.id)
        .order_by(Telemetry.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{device_id}/history", response_model=List[TelemetryResponse])
async def get_history(
    device_id: str,
    hours: int = Query(24, ge=1, le=168),
    session: AsyncSession = Depends(db_session),
):
    from datetime import timedelta
    device = await _get_device_or_404(session, device_id)
    # FIX: use timezone-aware UTC to match stored timestamps
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await session.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device.id)
        .where(Telemetry.timestamp >= since)
        .order_by(Telemetry.timestamp.asc())
    )
    return result.scalars().all()


@router.get("/{device_id}/risk", response_model=RiskResponse)
async def get_risk(
    device_id: str,
    session: AsyncSession = Depends(db_session),
):
    device = await _get_device_or_404(session, device_id)
    result = await session.execute(
        select(RiskAssessment)
        .where(RiskAssessment.device_id == device.id)
        .order_by(RiskAssessment.timestamp.desc())
        .limit(1)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        # Return a safe default when no telemetry has been received yet
        return RiskResponse(
            id="no-data",
            device_id=device_id,
            timestamp=datetime.now(timezone.utc),
            risk_score=0,
            risk_level="UNKNOWN",
            contributing_factors=None,
            llm_summary="Insufficient telemetry for risk assessment",
        )
    return risk


@router.post("/{device_id}/emergency-stop", response_model=CommandResponse)
async def emergency_stop(
    device_id: str,
    body: EmergencyStopRequest,
    session: AsyncSession = Depends(db_session),
):
    device = await _get_device_or_404(session, device_id)

    event = DeviceEvent(
        device_id=device.id,
        event_type="EMERGENCY_STOP",
        payload=json.dumps({"reason": body.reason, "operator": body.operator}),
        status="PENDING",
        operator=body.operator,
    )
    session.add(event)
    await session.flush()

    command_topic = f"ivara/device/{device_id}/command"
    command_payload = {
        "command": "EMERGENCY_STOP",
        "event_id": event.id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "operator": body.operator,
    }

    try:
        await publish_command(command_topic, command_payload, qos=2)
    except Exception as exc:
        event.status = "FAILED"
        await session.flush()
        logger.error("Failed to send emergency stop to %s: %s", device_id, exc)
        raise HTTPException(status_code=503, detail=f"MQTT publish failed: {exc}")

    # Broadcast immediately
    from app.websocket.manager import ws_manager
    await ws_manager.broadcast(
        "emergency_stop",
        {"device_id": device_id, "event_id": event.id, "status": "STOP_REQUESTED"},
        device_id=device_id,
    )

    return CommandResponse(
        event_id=event.id,
        device_id=device_id,
        command="EMERGENCY_STOP",
        status="STOP_REQUESTED",
        timestamp=event.timestamp,
    )


@router.post("/{device_id}/control-mode", response_model=CommandResponse)
async def set_control_mode(
    device_id: str,
    body: ControlModeRequest,
    session: AsyncSession = Depends(db_session),
):
    device = await _get_device_or_404(session, device_id)

    event = DeviceEvent(
        device_id=device.id,
        event_type="CONTROL_MODE_CHANGE",
        payload=json.dumps({
            "mode": body.mode,
            "target_flow": body.target_flow,
            "servo_angle": body.servo_angle,
        }),
        status="PENDING",
        operator=body.operator,
    )
    session.add(event)
    await session.flush()

    command_topic = f"ivara/device/{device_id}/command"
    command_payload = {
        "command": "SET_MODE",
        "mode": body.mode,
        "target_flow": body.target_flow,
        "servo_angle": body.servo_angle,
        "event_id": event.id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await publish_command(command_topic, command_payload, qos=1)
    except Exception as exc:
        event.status = "FAILED"
        await session.flush()
        raise HTTPException(status_code=503, detail=f"MQTT publish failed: {exc}")

    return CommandResponse(
        event_id=event.id,
        device_id=device_id,
        command=f"SET_MODE:{body.mode}",
        status="PENDING",
        timestamp=event.timestamp,
    )


@router.get("/{device_id}/calibration", response_model=List[CalibrationResponse])
async def get_calibration(
    device_id: str,
    session: AsyncSession = Depends(db_session),
):
    device = await _get_device_or_404(session, device_id)
    result = await session.execute(
        select(FlowCalibration)
        .where(FlowCalibration.device_id == device.id)
        .order_by(FlowCalibration.servo_angle.asc())
    )
    return result.scalars().all()


@router.post("/{device_id}/calibration", response_model=CalibrationResponse, status_code=201)
async def add_calibration_point(
    device_id: str,
    body: CalibrationPoint,
    session: AsyncSession = Depends(db_session),
):
    device = await _get_device_or_404(session, device_id)
    cal = FlowCalibration(
        device_id=device.id,
        servo_angle=body.servo_angle,
        measured_flow_rate=body.measured_flow_rate,
        notes=body.notes,
    )
    session.add(cal)
    await session.flush()
    return cal
