"""
IVaaRA – System Status API
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import db_session
from app.models import Alert, Device
from app.mqtt.client import get_mqtt_status
from app.schemas.schemas import SystemStatusResponse
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status(session: AsyncSession = Depends(db_session)):
    mqtt = get_mqtt_status()

    total = (await session.execute(select(func.count(Device.id)))).scalar() or 0
    online = (await session.execute(
        select(func.count(Device.id)).where(Device.status == "ONLINE")
    )).scalar() or 0
    offline = total - online

    active_alerts = (await session.execute(
        select(func.count(Alert.id)).where(Alert.status == "ACTIVE")
    )).scalar() or 0
    critical_alerts = (await session.execute(
        select(func.count(Alert.id))
        .where(Alert.status == "ACTIVE")
        .where(Alert.severity == "CRITICAL")
    )).scalar() or 0

    return SystemStatusResponse(
        backend_status="OK",
        mqtt_connected=mqtt["connected"],
        mqtt_latency_ms=mqtt.get("latency_ms"),
        total_devices=total,
        online_devices=online,
        offline_devices=offline,
        active_alerts=active_alerts,
        critical_alerts=critical_alerts,
        timestamp=datetime.now(timezone.utc),
    )
