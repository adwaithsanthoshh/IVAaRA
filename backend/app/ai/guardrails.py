"""
IVaaRA – AI Guardrail layer.
Validates, sanitizes, and enforces schema on all Groq responses.
"""
import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Allowed values ────────────────────────────────────────────
ALLOWED_RISK_LEVELS = {"low", "moderate", "elevated", "critical", "unknown"}
ALLOWED_TRENDS = {
    "stable", "decreasing", "increasing", "transient_deviation",
    "progressive_reduction", "irregular", "recovery", "unknown",
}
ALLOWED_ANOMALY_TYPES = {
    "transient_deviation", "persistent_deviation", "progressive_reduction",
    "irregular_pattern", "recovery_after_anomaly", "none",
}

# ── Pattern validators ────────────────────────────────────────
DEVICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
_UNSAFE_PATTERN = re.compile(r"[<>\"'`]|javascript:|data:|<script", re.IGNORECASE)


def sanitize_input(data: Any) -> Any:
    """Recursively sanitize dict/list/str inputs before sending to Groq."""
    if isinstance(data, dict):
        return {k: sanitize_input(v) for k, v in data.items()}
    if isinstance(data, list):
        return [sanitize_input(v) for v in data]
    if isinstance(data, str):
        return remove_unsafe_content(data[:2000])  # cap string length
    return data


def remove_unsafe_content(text: str) -> str:
    """Strip potentially unsafe characters/patterns from text."""
    return _UNSAFE_PATTERN.sub("", text).strip()


def validate_risk_level(value: Any) -> str:
    if isinstance(value, str) and value.lower() in ALLOWED_RISK_LEVELS:
        return value.lower()
    logger.warning("Invalid risk_level from AI: %r — defaulting to unknown", value)
    return "unknown"


def validate_trend(value: Any) -> str:
    if isinstance(value, str) and value.lower() in ALLOWED_TRENDS:
        return value.lower()
    logger.warning("Invalid trend from AI: %r — defaulting to unknown", value)
    return "unknown"


def validate_recommendation(text: Any, max_len: int = 200) -> str:
    if not isinstance(text, str):
        return "Continue deterministic monitoring."
    cleaned = remove_unsafe_content(text)
    return cleaned[:max_len] if cleaned else "Continue deterministic monitoring."


def validate_llm_response(response: Any) -> Optional[dict]:
    """Parse and validate a Groq response string into a dict. Returns None if invalid."""
    if isinstance(response, dict):
        return response
    if not isinstance(response, str):
        logger.warning("AI response is not a string or dict: %r", type(response))
        return None
    # Strip markdown code fences if present
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("Not a JSON object")
        return parsed
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("AI JSON parse error: %s — response: %.200r", exc, response)
        return None


def enforce_output_schema(raw: dict) -> dict:
    """Coerce and validate all fields of a risk analysis response."""
    return {
        "risk_level": validate_risk_level(raw.get("risk_level", "unknown")),
        "trend": validate_trend(raw.get("trend", "unknown")),
        "anomaly": bool(raw.get("anomaly", False)),
        "confidence": float(min(1.0, max(0.0, raw.get("confidence", 0.0)))),
        "reason": validate_recommendation(raw.get("reason", ""), 300),
        "recommendation": validate_recommendation(raw.get("recommendation", ""), 200),
        "alert_required": bool(raw.get("alert_required", False)),
        "summary": validate_recommendation(raw.get("summary", ""), 100),
    }
