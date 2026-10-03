"""
IVaaRA – AI API Routes
POST /api/ai/analyze/{device_id}
GET  /api/ai/insight/{device_id}
POST /api/ai/chat
GET  /api/ai/status
"""
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import db_session
from app.models import Alert, Device, RiskAssessment, Telemetry
from app.ai.service import ai_service
from app.ai.schemas import (
    AIChatResponse,
    AIRiskAnalysis,
    AIStatusResponse,
    ChatRequest,
    TelemetryContext,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)


async def _build_telemetry_context(session: AsyncSession, device_id: str) -> TelemetryContext:
    """
    Build aggregated TelemetryContext from DB — never raw sensor readings.
    Backend calculates statistics; Groq only interprets.
    """
    # Get device
    result = await session.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found")

    # Last 20 telemetry records for statistics
    tel_result = await session.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device.id)
        .order_by(Telemetry.timestamp.desc())
        .limit(20)
    )
    records = list(tel_result.scalars().all())
    records.reverse()  # chronological

    # Latest single record
    latest = records[-1] if records else None

    # Backend-computed statistics (never send raw readings to Groq)
    flows = [r.flow_rate for r in records if r.flow_rate is not None]
    avg_flow = round(sum(flows) / len(flows), 2) if flows else None
    min_flow = round(min(flows), 2) if flows else None
    max_flow = round(max(flows), 2) if flows else None

    # Baseline: use first-half average as "expected" baseline
    if len(flows) >= 6:
        half = len(flows) // 2
        baseline_flow = round(sum(flows[:half]) / half, 2)
    else:
        baseline_flow = avg_flow

    # Rate of change (drops/min per sample interval)
    rate_of_change = None
    if len(flows) >= 4:
        first_avg = sum(flows[:len(flows)//2]) / (len(flows)//2)
        second_avg = sum(flows[len(flows)//2:]) / (len(flows) - len(flows)//2)
        rate_of_change = round(second_avg - first_avg, 2)

    # Duration of current deviation (how long has flow been below baseline)
    deviation_seconds = 0
    if baseline_flow and flows:
        threshold = baseline_flow * 0.85  # 15% below baseline counts as deviation
        for r in reversed(records):
            if r.flow_rate is not None and r.flow_rate < threshold:
                deviation_seconds += 5  # approximate telemetry interval
            else:
                break

    # Active alert count
    alert_result = await session.execute(
        select(func.count(Alert.id))
        .where(Alert.device_id == device.id)
        .where(Alert.status == "ACTIVE")
    )
    active_alert_count = alert_result.scalar() or 0

    return TelemetryContext(
        device_id=device_id,
        current_flow=round(latest.flow_rate, 2) if latest and latest.flow_rate is not None else None,
        average_flow=avg_flow,
        baseline_flow=baseline_flow,
        minimum_flow=min_flow,
        maximum_flow=max_flow,
        rate_of_change=rate_of_change,
        duration_of_deviation_seconds=deviation_seconds,
        servo_position=latest.servo_angle if latest else None,
        temperature=round(latest.temperature, 2) if latest and latest.temperature is not None else None,
        remaining_volume_ml=round(latest.remaining_volume_ml, 1) if latest and latest.remaining_volume_ml is not None else None,
        recent_anomaly_count=active_alert_count,
        active_alert_count=active_alert_count,
        sensor_status=latest.sensor_status if latest else None,
        sample_count=len(records),
    )


@router.get("/status", response_model=AIStatusResponse)
async def get_ai_status():
    """Check Groq AI availability."""
    return ai_service.get_status()


@router.post("/analyze/{device_id}", response_model=AIRiskAnalysis)
async def analyze_device(
    device_id: str,
    session: AsyncSession = Depends(db_session),
):
    """Trigger AI risk analysis for a device. Returns structured risk assessment."""
    try:
        ctx = await _build_telemetry_context(session, device_id)
        result = await ai_service.analyze_iv_risk(ctx)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("AI analysis error for %s: %s", device_id, exc)
        from app.ai.fallback import fallback_risk
        return fallback_risk()


@router.get("/insight/{device_id}", response_model=AIRiskAnalysis)
async def get_ai_insight(
    device_id: str,
    session: AsyncSession = Depends(db_session),
):
    """Get the latest cached AI insight (or generate fresh if needed)."""
    # For now, generate fresh — future: add DB caching of last result
    try:
        ctx = await _build_telemetry_context(session, device_id)
        result = await ai_service.analyze_iv_risk(ctx)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("AI insight error for %s: %s", device_id, exc)
        from app.ai.fallback import fallback_risk
        return fallback_risk()


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    body: ChatRequest,
    session: AsyncSession = Depends(db_session),
):
    """
    Answer an operator question about a device using backend telemetry context.
    The frontend NEVER calls Groq directly — all context is assembled here.
    """
    try:
        # Build rich context from actual backend data
        ctx = await _build_telemetry_context(session, body.device_id)

        # Fetch recent alerts for context
        alert_result = await session.execute(
            select(Alert)
            .where(Alert.device_id == (
                select(Device.id).where(Device.device_id == body.device_id).scalar_subquery()
            ))
            .order_by(Alert.timestamp.desc())
            .limit(5)
        )
        recent_alerts = [
            {
                "type": a.alert_type,
                "severity": a.severity,
                "message": a.message,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                "status": a.status,
            }
            for a in alert_result.scalars().all()
        ]

        context = {
            "device_id": body.device_id,
            "telemetry_summary": ctx.model_dump(exclude_none=True),
            "recent_alerts": recent_alerts,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        return await ai_service.answer_iv_question(
            question=body.question,
            context=context,
            device_id=body.device_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("AI chat error: %s", exc)
        from app.ai.fallback import fallback_chat
        return fallback_chat(body.device_id, str(exc))


@router.get("/session-summary/{device_id}")
async def get_session_summary(
    device_id: str,
    hours: int = 4,
    session: AsyncSession = Depends(db_session),
):
    """Generate AI session summary for the last N hours."""
    try:
        from datetime import timedelta
        from sqlalchemy import and_

        device_result = await session.execute(select(Device).where(Device.device_id == device_id))
        device = device_result.scalar_one_or_none()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        tel_result = await session.execute(
            select(Telemetry)
            .where(and_(Telemetry.device_id == device.id, Telemetry.timestamp >= cutoff))
            .order_by(Telemetry.timestamp.asc())
        )
        records = list(tel_result.scalars().all())
        flows = [r.flow_rate for r in records if r.flow_rate is not None]

        alert_result = await session.execute(
            select(func.count(Alert.id))
            .where(and_(Alert.device_id == device.id, Alert.timestamp >= cutoff))
        )
        alert_count = alert_result.scalar() or 0

        session_data = {
            "device_id": device_id,
            "duration": f"{hours} hours",
            "statistics": {
                "avg_flow": round(sum(flows) / len(flows), 2) if flows else None,
                "min_flow": round(min(flows), 2) if flows else None,
                "max_flow": round(max(flows), 2) if flows else None,
                "alert_count": alert_count,
                "sample_count": len(records),
            },
        }
        summary = await ai_service.generate_session_summary(session_data)
        return {"device_id": device_id, "hours": hours, "summary": summary, "statistics": session_data["statistics"]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Session summary error: %s", exc)
        return {"device_id": device_id, "hours": hours, "summary": "AI summary unavailable.", "statistics": {}}
