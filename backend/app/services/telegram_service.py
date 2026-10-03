"""
IVaaRA – Telegram Notification Service (optional)
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def send_alert(alert_data: dict) -> None:
    """Send a formatted alert to Telegram."""
    from app.config import get_settings
    settings = get_settings()

    if not settings.telegram_enabled:
        return

    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        logger.warning("Telegram enabled but bot token/chat ID not configured")
        return

    try:
        import aiohttp
        message = _format_alert(alert_data)
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json={
                "chat_id": settings.telegram_chat_id,
                "text": message,
                "parse_mode": "HTML",
            }) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error("Telegram API error %d: %s", resp.status, body)
                else:
                    logger.info("Telegram alert sent for device %s", alert_data.get("device_id"))
    except Exception as exc:
        logger.error("Telegram send failed: %s", exc)


def _format_alert(alert_data: dict) -> str:
    severity = alert_data.get("severity", "UNKNOWN")
    device_id = alert_data.get("device_id", "UNKNOWN")
    alert_type = alert_data.get("alert_type", "UNKNOWN")
    message = alert_data.get("message", "")
    timestamp = alert_data.get("timestamp", "")
    action = alert_data.get("action_taken", "")

    emoji = {"CRITICAL": "🔴", "WARNING": "🟡", "INFO": "🔵"}.get(severity, "⚪")

    lines = [
        f"{emoji} <b>IVaaRA {severity} ALERT</b>",
        "",
        f"<b>Device:</b> {device_id}",
        f"<b>Type:</b> {alert_type}",
        f"<b>Message:</b> {message}",
    ]
    if action:
        lines.append(f"<b>Action:</b> {action}")
    if timestamp:
        lines.append(f"<b>Time:</b> {timestamp}")

    return "\n".join(lines)
