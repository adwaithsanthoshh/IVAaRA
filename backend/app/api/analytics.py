"""
IVaaRA – Analytics API
"""
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import db_session
from app.models import Alert, Device, Telemetry
from app.schemas.schemas import AnalyticsSummary

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary/{device_id}", response_model=AnalyticsSummary)
async def get_analytics_summary(
    device_id: str,
    hours: int = Query(24, ge=1, le=168),
    session: AsyncSession = Depends(db_session),
):
    from app.api.devices import _get_device_or_404
    device = await _get_device_or_404(session, device_id)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    # Flow stats
    stats = await session.execute(
        select(
            func.avg(Telemetry.flow_rate),
            func.min(Telemetry.flow_rate),
            func.max(Telemetry.flow_rate),
            func.avg(Telemetry.temperature),
        )
        .where(Telemetry.device_id == device.id)
        .where(Telemetry.timestamp >= since)
    )
    row = stats.one()

    alert_count = (await session.execute(
        select(func.count(Alert.id))
        .where(Alert.device_id == device.id)
        .where(Alert.timestamp >= since)
    )).scalar() or 0

    return AnalyticsSummary(
        device_id=device_id,
        period_hours=hours,
        avg_flow=round(row[0], 2) if row[0] else None,
        min_flow=round(row[1], 2) if row[1] else None,
        max_flow=round(row[2], 2) if row[2] else None,
        avg_temperature=round(row[3], 2) if row[3] else None,
        alert_count=alert_count,
        uptime_percent=None,  # Can calculate from DeviceEvent log
    )
