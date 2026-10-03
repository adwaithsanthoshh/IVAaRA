"""
IVaaRA – AI Fallback responses.
Used when Groq is unavailable, times out, or returns invalid data.
"""
from .schemas import AIRiskAnalysis, AITrendAnalysis, AIAnomalyAnalysis, AIChatResponse
from datetime import datetime, timezone


def fallback_risk() -> AIRiskAnalysis:
    return AIRiskAnalysis(
        risk_level="unknown",
        trend="unknown",
        anomaly=False,
        confidence=0.0,
        reason="AI analysis unavailable.",
        recommendation="Continue deterministic monitoring.",
        alert_required=False,
        summary="AI analysis unavailable.",
        ai_available=False,
    )


def fallback_trend() -> AITrendAnalysis:
    return AITrendAnalysis(
        trend="unknown",
        rate_of_change=0.0,
        anomaly=False,
        confidence=0.0,
        summary="AI trend analysis unavailable.",
        ai_available=False,
    )


def fallback_anomaly() -> AIAnomalyAnalysis:
    return AIAnomalyAnalysis(
        anomaly=False,
        type="none",
        reason="AI analysis unavailable.",
        summary="AI analysis unavailable.",
        ai_available=False,
    )


def fallback_chat(device_id: str, reason: str = "AI is currently unavailable.") -> AIChatResponse:
    return AIChatResponse(
        answer=f"AI analysis is currently unavailable: {reason}. Please check deterministic monitoring data.",
        device_id=device_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        ai_available=False,
    )
