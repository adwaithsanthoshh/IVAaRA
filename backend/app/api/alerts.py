"""
IVaaRA – Alerts API Router
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import db_session
from app.models import Alert, Device
from app.schemas.schemas import AlertAcknowledgeRequest, AlertResponse

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=List[AlertResponse])
async def list_alerts(
    session: AsyncSession = Depends(db_session),
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE/ACKNOWLEDGED/RESOLVED"),
    severity: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = select(Alert).order_by(Alert.timestamp.desc())
    if status:
        query = query.where(Alert.status == status.upper())
    if severity:
        query = query.where(Alert.severity == severity.upper())
    if device_id:
        # Join to find device
        dev_result = await session.execute(
            select(Device.id).where(Device.device_id == device_id)
        )
        dev_db_id = dev_result.scalar_one_or_none()
        if dev_db_id:
            query = query.where(Alert.device_id == dev_db_id)
    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    alerts = result.scalars().all()

    # Enrich with device_id string
    enriched = []
    for alert in alerts:
        dev_result = await session.execute(
            select(Device.device_id).where(Device.id == alert.device_id)
        )
        device_id_str = dev_result.scalar_one_or_none() or alert.device_id
        resp = AlertResponse.model_validate(alert)
        resp.device_id = device_id_str
        enriched.append(resp)

    return enriched


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: str,
    session: AsyncSession = Depends(db_session),
):
    alert = await session.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: str,
    body: AlertAcknowledgeRequest,
    session: AsyncSession = Depends(db_session),
):
    alert = await session.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status == "RESOLVED":
        raise HTTPException(status_code=400, detail="Alert already resolved")

    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_at = datetime.now(timezone.utc)
    if body.action_taken:
        alert.action_taken = body.action_taken
    await session.flush()

    # Broadcast update
    from app.websocket.manager import ws_manager
    await ws_manager.broadcast(
        "alert_update",
        {"alert_id": alert_id, "status": "ACKNOWLEDGED"},
    )
    return alert
