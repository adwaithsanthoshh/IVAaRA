"""
IVaaRA – Core Telemetry Processing Service
Handles: DB storage → Alert evaluation → Risk scoring → WebSocket broadcast
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import evaluate_telemetry, create_device_offline_alert, resolve_device_offline_alert
from app.config import get_settings
from app.database import get_db
from app.models import Alert, Device, RiskAssessment, Telemetry, DeviceEvent
from app.risk.engine import calculate_risk_score
from app.schemas.schemas import TelemetryPayload, TelemetryResponse
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)


async def process_telemetry(telemetry: TelemetryPayload) -> None:
    """
    Full pipeline:
    1. Upsert device last_seen + status
    2. Store telemetry record
    3. Run alert engine
    4. Run risk engine
    5. Broadcast via WebSocket
    """
    async with get_db() as session:
        device = await _get_or_create_device(session, telemetry.device_id)
        if device is None:
            logger.warning("No device record for %s — skipping", telemetry.device_id)
            return

        # Mark device ONLINE and update last_seen
        was_offline = device.status == "OFFLINE"
        device.status = "ONLINE"
        device.last_seen = datetime.now(timezone.utc)
        await session.flush()

        # Resolve offline alert if device just came back
        if was_offline:
            await resolve_device_offline_alert(session, device.id, telemetry.device_id)

        # Override target_flow from telemetry if not set on device
        target_flow = telemetry.target_flow or None

        # Store telemetry
        tel = Telemetry(
            device_id=device.id,
            timestamp=telemetry.timestamp,
            flow_rate=telemetry.flow_rate,
            target_flow=target_flow,
            temperature=telemetry.temperature,
            remaining_volume_ml=telemetry.remaining_volume_ml,
            servo_angle=telemetry.servo_angle,
            automatic_control=telemetry.automatic_control,
            sensor_status=telemetry.sensor_status,
        )
        session.add(tel)
        await session.flush()

        # Trim old telemetry (retention)
        settings = get_settings()
        if settings.telemetry_max_records > 0:
            await _trim_telemetry(session, device.id, settings.telemetry_max_records)

        # Alert engine
        new_alerts = await evaluate_telemetry(session, telemetry, target_flow)

        # Count active alerts for risk
        active_count_result = await session.execute(
            select(func.count(Alert.id))
            .where(Alert.device_id == device.id)
            .where(Alert.status == "ACTIVE")
        )
        active_alert_count = active_count_result.scalar() or 0

        # Risk engine
        score, level, factors = calculate_risk_score(
            telemetry, target_flow, active_alert_count, device.status
        )
        risk = RiskAssessment(
            device_id=device.id,
            risk_score=score,
            risk_level=level,
            contributing_factors=json.dumps(factors),
        )
        session.add(risk)
        await session.flush()

    # Broadcast telemetry update
    await ws_manager.broadcast(
        "telemetry",
        {
            "device_id": telemetry.device_id,
            "flow_rate": telemetry.flow_rate,
            "target_flow": target_flow,
            "temperature": telemetry.temperature,
            "remaining_volume_ml": telemetry.remaining_volume_ml,
            "servo_angle": telemetry.servo_angle,
            "automatic_control": telemetry.automatic_control,
            "sensor_status": telemetry.sensor_status,
            "timestamp": telemetry.timestamp.isoformat(),
        },
        device_id=telemetry.device_id,
    )

    # Broadcast risk update
    await ws_manager.broadcast(
        "risk",
        {
            "device_id": telemetry.device_id,
            "risk_score": score,
            "risk_level": level,
            "contributing_factors": factors,
        },
        device_id=telemetry.device_id,
    )

    # Broadcast each new alert
    for alert_data in new_alerts:
        await ws_manager.broadcast("alert", alert_data, device_id=telemetry.device_id)
        await _send_telegram_alert(alert_data)


async def _get_or_create_device(session: AsyncSession, device_id: str) -> Optional[Device]:
    result = await session.execute(
        select(Device).where(Device.device_id == device_id)
    )
    device = result.scalar_one_or_none()
    if device is None:
        # Auto-register unknown devices
        device = Device(
            device_id=device_id,
            name=device_id,
            mqtt_topic_prefix=f"ivara/device/{device_id}",
            status="ONLINE",
        )
        session.add(device)
        await session.flush()
        logger.info("Auto-registered device: %s", device_id)
    return device


async def _trim_telemetry(session: AsyncSession, device_db_id: str, max_records: int) -> None:
    """Delete oldest telemetry records beyond retention limit."""
    result = await session.execute(
        select(func.count(Telemetry.id)).where(Telemetry.device_id == device_db_id)
    )
    count = result.scalar() or 0
    if count > max_records:
        excess = count - max_records
        old_ids_result = await session.execute(
            select(Telemetry.id)
            .where(Telemetry.device_id == device_db_id)
            .order_by(Telemetry.timestamp.asc())
            .limit(excess)
        )
        old_ids = [row[0] for row in old_ids_result.all()]
        for tid in old_ids:
            tel = await session.get(Telemetry, tid)
            if tel:
                await session.delete(tel)


async def _send_telegram_alert(alert_data: dict) -> None:
    """Send Telegram notification for critical alerts (non-blocking)."""
    settings = get_settings()
    if not settings.telegram_enabled or alert_data.get("severity") != "CRITICAL":
        return
    try:
        from app.services.telegram_service import send_alert
        await send_alert(alert_data)
    except Exception as exc:
        logger.warning("Telegram notification failed: %s", exc)


async def handle_command_ack(device_id: str, ack_data: dict) -> None:
    """Update DeviceEvent status when ESP32 acknowledges a command."""
    async with get_db() as session:
        event_id = ack_data.get("event_id")
        ack_status = ack_data.get("status", "ACKNOWLEDGED")
        if event_id:
            event = await session.get(DeviceEvent, event_id)
            if event:
                event.status = ack_status
                event.acknowledged_at = datetime.now(timezone.utc)
                await session.flush()

        await ws_manager.broadcast(
            "device_ack",
            {"device_id": device_id, "event_id": event_id, "status": ack_status},
            device_id=device_id,
        )


async def offline_monitor_loop(stop_event: asyncio.Event) -> None:
    """
    Background task: checks all devices for offline timeout.
    Runs every `device_offline_timeout / 2` seconds.
    """
    settings = get_settings()
    interval = settings.device_offline_timeout // 2
    while not stop_event.is_set():
        await asyncio.sleep(interval)
        try:
            await _check_offline_devices()
        except Exception as exc:
            logger.error("Offline monitor error: %s", exc)


async def _check_offline_devices() -> None:
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.device_offline_timeout)

    async with get_db() as session:
        result = await session.execute(
            select(Device).where(Device.status == "ONLINE")
        )
        devices = result.scalars().all()

        for device in devices:
            if device.last_seen is None:
                continue

            # Normalise last_seen: SQLite may return naive datetimes from
            # pre-migration rows. Treat them as UTC so comparison never crashes.
            last_seen = device.last_seen
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)

            if last_seen < cutoff:
                device.status = "OFFLINE"
                await session.flush()
                alert_data = await create_device_offline_alert(
                    session, device.device_id, device.id
                )
                if alert_data:
                    await ws_manager.broadcast(
                        "alert", alert_data, device_id=device.device_id
                    )
                await ws_manager.broadcast(
                    "device_status",
                    {"device_id": device.device_id, "status": "OFFLINE"},
                    device_id=device.device_id,
                )
                logger.warning("Device %s marked OFFLINE (no telemetry since %s)",
                               device.device_id, last_seen)

