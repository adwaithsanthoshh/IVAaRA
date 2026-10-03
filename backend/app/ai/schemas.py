"""
IVaaRA – AI Schemas (Pydantic models for AI input/output).
Separate from backend DB schemas to keep concerns isolated.
"""
from typing import Optional
from pydantic import BaseModel, Field


# ── AI Input Schemas ──────────────────────────────────────────

class TelemetryContext(BaseModel):
    """Aggregated, summarized telemetry sent to Groq — never raw sensor readings."""
    device_id: str
    current_flow: Optional[float] = None
    average_flow: Optional[float] = None
    baseline_flow: Optional[float] = None
    minimum_flow: Optional[float] = None
    maximum_flow: Optional[float] = None
    flow_trend: Optional[str] = None
    rate_of_change: Optional[float] = None
    duration_of_deviation_seconds: Optional[int] = None
    servo_position: Optional[int] = None
    temperature: Optional[float] = None
    remaining_volume_ml: Optional[float] = None
    recent_anomaly_count: int = 0
    active_alert_count: int = 0
    sensor_status: Optional[str] = None
    sample_count: int = 0


class ChatRequest(BaseModel):
    device_id: str = Field(..., description="Device to query about")
    question: str = Field(..., max_length=500, description="Operator question")


# ── AI Output Schemas ─────────────────────────────────────────

class AIRiskAnalysis(BaseModel):
    """Structured AI risk assessment — validated before use."""
    risk_level: str = "unknown"
    trend: str = "unknown"
    anomaly: bool = False
    confidence: float = 0.0
    reason: str = "AI analysis unavailable."
    recommendation: str = "Continue deterministic monitoring."
    alert_required: bool = False
    summary: str = "AI analysis unavailable."
    ai_available: bool = False
    model_used: Optional[str] = None


class AITrendAnalysis(BaseModel):
    trend: str = "unknown"
    rate_of_change: float = 0.0
    anomaly: bool = False
    confidence: float = 0.0
    summary: str = "Insufficient data."
    ai_available: bool = False


class AIAnomalyAnalysis(BaseModel):
    anomaly: bool = False
    type: str = "none"
    reason: str = "AI analysis unavailable."
    summary: str = "AI analysis unavailable."
    ai_available: bool = False


class AIChatResponse(BaseModel):
    answer: str
    device_id: str
    timestamp: str
    ai_available: bool


class AIStatusResponse(BaseModel):
    status: str           # AVAILABLE | UNAVAILABLE | CONFIGURATION_REQUIRED
    model: Optional[str]
    ai_available: bool
    key_count: int = 0    # how many Groq keys are configured
