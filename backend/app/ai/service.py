"""
IVaaRA – Central AI Service (Groq).

ONE centralized Groq client for the entire application.
All AI calls go through this service — never create independent Groq clients.

Architecture:
  Telemetry → Backend aggregation → AIService → Groq → Guardrails → Dashboard/Telegram
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.config import get_settings

from .fallback import fallback_anomaly, fallback_chat, fallback_risk, fallback_trend
from .guardrails import (
    enforce_output_schema,
    sanitize_input,
    validate_llm_response,
    validate_recommendation,
    validate_trend,
)
from .prompts import (
    ALERT_GENERATION_PROMPT,
    ANOMALY_PROMPT,
    CHAT_PROMPT,
    RISK_ANALYSIS_PROMPT,
    SESSION_SUMMARY_PROMPT,
    SYSTEM_PROMPT,
    TREND_ANALYSIS_PROMPT,
)
from .schemas import (
    AIAnomalyAnalysis,
    AIChatResponse,
    AIRiskAnalysis,
    AIStatusResponse,
    AITrendAnalysis,
    TelemetryContext,
)

logger = logging.getLogger(__name__)

# Per-device cooldown: {device_id: last_analysis_timestamp}
_cooldown_tracker: Dict[str, float] = {}


class AIService:
    """
    Centralized Groq AI service for IVaaRA.

    Key Failover Strategy:
      Tries GROQ_API_KEY_1 → GROQ_API_KEY_2 → GROQ_API_KEY_3 in order.
      On any error/timeout from a key, immediately tries the next one.
      Only returns a fallback response after ALL configured keys have failed.

    Responsibilities:
      - Multi-key Groq pool management
      - Prompt construction (from prompts.py)
      - Response parsing + guardrail validation
      - Timeout and error handling
      - Deterministic fallback

    NEVER allows AI failures to propagate to MQTT, telemetry, or hardware.
    """

    def __init__(self) -> None:
        # Maps api_key → AsyncGroq client (lazy-initialized)
        self._clients: dict[str, object] = {}
        self._initialized = False

    def _get_client(self, api_key: str):
        """Lazy-initialize and cache a Groq client for a given key."""
        if api_key in self._clients:
            return self._clients[api_key]
        try:
            from groq import AsyncGroq  # type: ignore
            client = AsyncGroq(api_key=api_key)
            self._clients[api_key] = client
            return client
        except ImportError:
            logger.warning("groq package not installed. AI features disabled.")
            return None
        except Exception as exc:
            logger.error("Failed to initialize Groq client: %s", exc)
            return None

    def get_status(self) -> AIStatusResponse:
        settings = get_settings()
        keys = settings.groq_keys
        if not keys:
            return AIStatusResponse(
                status="CONFIGURATION_REQUIRED",
                model=None,
                ai_available=False,
                key_count=0,
            )
        try:
            from groq import AsyncGroq  # type: ignore  # noqa: F401
        except ImportError:
            return AIStatusResponse(
                status="UNAVAILABLE",
                model=None,
                ai_available=False,
                key_count=0,
            )
        return AIStatusResponse(
            status="AVAILABLE",
            model=settings.groq_model,
            ai_available=True,
            key_count=len(keys),
        )

    def _check_cooldown(self, device_id: str) -> bool:
        """Returns True if AI analysis can proceed (cooldown elapsed)."""
        settings = get_settings()
        now = datetime.now(timezone.utc).timestamp()
        last = _cooldown_tracker.get(device_id, 0)
        if (now - last) >= settings.groq_ai_cooldown:
            _cooldown_tracker[device_id] = now
            return True
        return False

    async def call_groq(self, prompt: str, system: str = SYSTEM_PROMPT) -> Optional[str]:
        """
        Try each configured Groq API key in order.
        Key 1 fails → try Key 2 → try Key 3 → return None (triggers fallback).
        """
        settings = get_settings()
        keys = settings.groq_keys

        if not keys:
            logger.debug("No Groq API keys configured. Skipping AI call.")
            return None

        for idx, api_key in enumerate(keys, start=1):
            client = self._get_client(api_key)
            if client is None:
                logger.warning("Key %d: client initialization failed, trying next.", idx)
                continue

            try:
                response = await asyncio.wait_for(
                    client.chat.completions.create(
                        model=settings.groq_model,
                        messages=[
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.1,
                        max_tokens=settings.groq_max_tokens,
                    ),
                    timeout=settings.groq_timeout,
                )
                content = response.choices[0].message.content
                if idx > 1:
                    logger.info("Groq request succeeded on key %d.", idx)
                return content

            except asyncio.TimeoutError:
                logger.warning(
                    "Key %d: Groq request timed out after %ds.%s",
                    idx, settings.groq_timeout,
                    f" Trying key {idx + 1}..." if idx < len(keys) else " All keys exhausted.",
                )
            except Exception as exc:
                err_msg = str(exc)
                logger.warning(
                    "Key %d: Groq API error: %s.%s",
                    idx, err_msg,
                    f" Trying key {idx + 1}..." if idx < len(keys) else " All keys exhausted.",
                )

        # All keys failed — return None to trigger deterministic fallback
        logger.error("All %d Groq API key(s) failed. Using deterministic fallback.", len(keys))
        return None

    async def call_groq_with_guardrails(self, prompt: str) -> Optional[dict]:
        """Call Groq and run full validation pipeline on the response."""
        raw_response = await self.call_groq(prompt)
        if raw_response is None:
            return None
        parsed = validate_llm_response(raw_response)
        if parsed is None:
            return None
        return parsed

    # ── Core AI Functions ─────────────────────────────────────

    async def analyze_iv_risk(self, telemetry: TelemetryContext) -> AIRiskAnalysis:
        """Main risk analysis — triggered on significant telemetry change or alert."""
        settings = get_settings()
        if not settings.ai_available:
            return fallback_risk()

        sanitized = sanitize_input(telemetry.model_dump(exclude_none=True))
        prompt = RISK_ANALYSIS_PROMPT.format(
            telemetry_json=json.dumps(sanitized, indent=2)
        )

        raw = await self.call_groq_with_guardrails(prompt)
        if raw is None:
            return fallback_risk()

        try:
            validated = enforce_output_schema(raw)
            return AIRiskAnalysis(
                **validated,
                ai_available=True,
                model_used=settings.groq_model,
            )
        except Exception as exc:
            logger.error("Risk schema enforcement failed: %s", exc)
            return fallback_risk()

    async def analyze_flow_trend(
        self,
        history: List[float],
        baseline: float,
        duration_seconds: int = 0,
    ) -> AITrendAnalysis:
        """Analyze a flow sequence for trend patterns."""
        settings = get_settings()
        if not settings.ai_available or len(history) < 3:
            return fallback_trend()

        prompt = TREND_ANALYSIS_PROMPT.format(
            flow_values=json.dumps(history),
            baseline=baseline,
            duration_seconds=duration_seconds,
        )
        raw = await self.call_groq_with_guardrails(prompt)
        if raw is None:
            return fallback_trend()

        try:
            return AITrendAnalysis(
                trend=validate_trend(raw.get("trend", "unknown")),
                rate_of_change=float(raw.get("rate_of_change", 0.0)),
                anomaly=bool(raw.get("anomaly", False)),
                confidence=float(min(1.0, max(0.0, raw.get("confidence", 0.0)))),
                summary=validate_recommendation(raw.get("summary", ""), 150),
                ai_available=True,
            )
        except Exception as exc:
            logger.error("Trend analysis failed: %s", exc)
            return fallback_trend()

    async def analyze_anomaly(self, event_data: dict) -> AIAnomalyAnalysis:
        """Interpret a specific anomaly event."""
        settings = get_settings()
        if not settings.ai_available:
            return fallback_anomaly()

        sanitized = sanitize_input(event_data)
        prompt = ANOMALY_PROMPT.format(event_json=json.dumps(sanitized, indent=2))
        raw = await self.call_groq_with_guardrails(prompt)
        if raw is None:
            return fallback_anomaly()

        try:
            return AIAnomalyAnalysis(
                anomaly=bool(raw.get("anomaly", False)),
                type=str(raw.get("type", "none")),
                reason=validate_recommendation(raw.get("reason", ""), 300),
                summary=validate_recommendation(raw.get("summary", ""), 150),
                ai_available=True,
            )
        except Exception as exc:
            logger.error("Anomaly analysis failed: %s", exc)
            return fallback_anomaly()

    async def generate_alert(
        self,
        analysis: AIRiskAnalysis,
        device_id: str,
        current_flow: Optional[float],
        baseline: Optional[float],
    ) -> str:
        """Generate a human-readable alert message for Telegram/dashboard."""
        settings = get_settings()
        if not settings.ai_available:
            return (
                f"IVaaRA ALERT\n\nDevice: {device_id}\n"
                f"Current flow: {current_flow} drops/min\n"
                f"Monitoring priority: {analysis.risk_level.upper()}\n"
                f"(AI interpretation unavailable)"
            )

        prompt = ALERT_GENERATION_PROMPT.format(
            analysis_json=json.dumps(analysis.model_dump(), indent=2),
            device_id=device_id,
            current_flow=current_flow if current_flow is not None else "N/A",
            baseline=baseline if baseline is not None else "N/A",
        )
        msg = await self.call_groq(prompt)
        if msg:
            return remove_unsafe_content_str(msg[:800])
        # Deterministic fallback
        return (
            f"IVaaRA ALERT\n\nDevice: {device_id}\n"
            f"Current flow: {current_flow} drops/min\n"
            f"Baseline: {baseline} drops/min\n"
            f"Trend: {analysis.trend.upper()}\n"
            f"Monitoring priority: {analysis.risk_level.upper()}\n\n"
            f"AI interpretation: {analysis.reason}\n"
            f"Suggested monitoring action: {analysis.recommendation}"
        )

    async def generate_session_summary(self, session_data: dict) -> str:
        """Generate a monitoring session summary paragraph."""
        settings = get_settings()
        if not settings.ai_available:
            return "AI session summary unavailable. Review telemetry data manually."

        sanitized = sanitize_input(session_data)
        prompt = SESSION_SUMMARY_PROMPT.format(session_json=json.dumps(sanitized, indent=2))
        summary = await self.call_groq(prompt)
        return (validate_recommendation(summary, 600) if summary
                else "AI session summary unavailable.")

    async def generate_event_summary(self, event: dict) -> str:
        """Generate a brief AI explanation of a specific event."""
        settings = get_settings()
        if not settings.ai_available:
            return "AI event summary unavailable."
        analysis = await self.analyze_anomaly(event)
        return analysis.summary

    async def answer_iv_question(
        self,
        question: str,
        context: dict,
        device_id: str,
    ) -> AIChatResponse:
        """Answer an operator question using backend-assembled telemetry context."""
        settings = get_settings()
        ts = datetime.now(timezone.utc).isoformat()

        if not settings.ai_available:
            return fallback_chat(device_id, "No GROQ_API_KEY configured.")

        sanitized_q = validate_recommendation(question, 500)
        sanitized_ctx = sanitize_input(context)

        prompt = CHAT_PROMPT.format(
            context_json=json.dumps(sanitized_ctx, indent=2),
            question=sanitized_q,
        )
        answer = await self.call_groq(prompt)
        if answer:
            return AIChatResponse(
                answer=validate_recommendation(answer, 1000),
                device_id=device_id,
                timestamp=ts,
                ai_available=True,
            )
        return fallback_chat(device_id, "Groq did not return a response.")

    async def generate_monitoring_report(self, session_data: dict) -> str:
        """Full monitoring report with AI-generated interpretation."""
        summary = await self.generate_session_summary(session_data)
        stats = session_data.get("statistics", {})
        report_lines = [
            "=== IVaaRA AI-Generated Monitoring Summary ===",
            f"Device: {session_data.get('device_id', 'Unknown')}",
            f"Duration: {session_data.get('duration', 'N/A')}",
            "",
            f"Average flow: {stats.get('avg_flow', '—')} drops/min",
            f"Min flow:     {stats.get('min_flow', '—')} drops/min",
            f"Max flow:     {stats.get('max_flow', '—')} drops/min",
            f"Alert count:  {stats.get('alert_count', 0)}",
            "",
            "AI Interpretation:",
            summary,
            "",
            "Note: This is an AI-generated monitoring summary. Not a clinical diagnosis.",
        ]
        return "\n".join(report_lines)

    async def analyze_and_trigger(
        self,
        device_id: str,
        telemetry: TelemetryContext,
    ) -> Optional[AIRiskAnalysis]:
        """
        Event-driven analysis — only runs if cooldown has elapsed.
        Called from device_service after significant telemetry changes.
        Does NOT block MQTT processing.
        """
        if not self._check_cooldown(device_id):
            return None  # cooldown active — skip
        result = await self.analyze_iv_risk(telemetry)
        return result


def remove_unsafe_content_str(text: str) -> str:
    """Convenience wrapper for non-dict content."""
    from .guardrails import remove_unsafe_content
    return remove_unsafe_content(text)


# Singleton instance — import this everywhere
ai_service = AIService()
