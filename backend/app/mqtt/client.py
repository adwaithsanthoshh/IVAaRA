"""
IVaaRA – MQTT Client Service
Manages MQTT connection, subscriptions, and message routing.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import aiomqtt
from pydantic import ValidationError

from app.config import get_settings
from app.schemas.schemas import TelemetryPayload

logger = logging.getLogger(__name__)

# Singleton state
_mqtt_connected: bool = False
_mqtt_latency_ms: Optional[float] = None
_last_ping: Optional[datetime] = None

# Callback registry: external services register handlers here
_telemetry_handlers = []


def register_telemetry_handler(handler) -> None:
    """Register an async callable(telemetry: TelemetryPayload) -> None."""
    _telemetry_handlers.append(handler)


def get_mqtt_status() -> dict:
    return {
        "connected": _mqtt_connected,
        "latency_ms": _mqtt_latency_ms,
        "last_ping": _last_ping.isoformat() if _last_ping else None,
    }


async def mqtt_listener(stop_event: asyncio.Event) -> None:
    """
    Main MQTT loop. Connects to broker and processes messages.
    Reconnects automatically on failure.
    """
    global _mqtt_connected, _mqtt_latency_ms, _last_ping
    settings = get_settings()

    while not stop_event.is_set():
        try:
            logger.info("Connecting to MQTT broker %s:%d", settings.mqtt_host, settings.mqtt_port)
            async with aiomqtt.Client(
                hostname=settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_username or None,
                password=settings.mqtt_password or None,
                identifier=settings.mqtt_client_id,
                keepalive=settings.mqtt_keepalive,
                will=aiomqtt.Will(
                    topic="ivara/backend/status",
                    payload=json.dumps({"status": "OFFLINE", "timestamp": datetime.now(timezone.utc).isoformat()}),
                    qos=1,
                    retain=True,
                ),
            ) as client:
                _mqtt_connected = True
                logger.info("MQTT connected")

                # Announce backend online
                await client.publish(
                    "ivara/backend/status",
                    json.dumps({"status": "ONLINE", "timestamp": datetime.now(timezone.utc).isoformat()}),
                    qos=1,
                    retain=True,
                )

                # Subscribe to all device topics
                await client.subscribe("ivara/device/+/telemetry", qos=1)
                await client.subscribe("ivara/device/+/status", qos=1)
                await client.subscribe("ivara/device/+/alert", qos=1)
                await client.subscribe("ivara/device/+/ack", qos=1)
                logger.info("Subscribed to ivara/device/# topics")

                async for message in client.messages:
                    if stop_event.is_set():
                        break
                    topic = str(message.topic)
                    try:
                        payload_str = message.payload.decode("utf-8")
                        await _dispatch_message(topic, payload_str, client)
                    except Exception as exc:
                        logger.warning("Error processing MQTT message on %s: %s", topic, exc)

        except aiomqtt.MqttError as exc:
            _mqtt_connected = False
            logger.warning("MQTT connection error: %s. Reconnecting in 5s...", exc)
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            _mqtt_connected = False
            logger.error("Unexpected MQTT error: %s. Reconnecting in 10s...", exc)
            await asyncio.sleep(10)

    _mqtt_connected = False
    logger.info("MQTT listener stopped")


async def _dispatch_message(topic: str, payload_str: str, client: aiomqtt.Client) -> None:
    """Route MQTT messages to the appropriate handler."""
    global _mqtt_latency_ms, _last_ping
    parts = topic.split("/")
    # Expected: ivara/device/{device_id}/{type}
    if len(parts) < 4 or parts[0] != "ivara" or parts[1] != "device":
        return

    device_id = parts[2]
    msg_type = parts[3]

    if msg_type == "telemetry":
        await _handle_telemetry(device_id, payload_str)
    elif msg_type == "ack":
        await _handle_ack(device_id, payload_str)
    elif msg_type == "status":
        logger.debug("Device status from %s: %s", device_id, payload_str[:100])
    elif msg_type == "alert":
        logger.info("Device alert from %s: %s", device_id, payload_str[:200])


async def _handle_telemetry(device_id: str, payload_str: str) -> None:
    """Validate and dispatch telemetry to registered handlers."""
    try:
        raw = json.loads(payload_str)
        # Ensure device_id matches topic
        raw["device_id"] = device_id
        telemetry = TelemetryPayload(**raw)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Invalid telemetry from %s: %s", device_id, exc)
        return

    for handler in _telemetry_handlers:
        try:
            await handler(telemetry)
        except Exception as exc:
            logger.error("Telemetry handler error: %s", exc)


async def _handle_ack(device_id: str, payload_str: str) -> None:
    """Handle command acknowledgement from ESP32."""
    try:
        data = json.loads(payload_str)
        logger.info("Command ACK from %s: %s", device_id, data)
        # Import here to avoid circular imports
        from app.services.device_service import handle_command_ack
        await handle_command_ack(device_id, data)
    except Exception as exc:
        logger.error("ACK handler error: %s", exc)


async def publish_command(
    client_or_topic: str, payload: dict, qos: int = 1
) -> None:
    """
    Publish a command. This is called from the API layer.
    NOTE: The MQTT client is managed in the listener loop.
    Commands are published via a separate one-shot client.
    """
    settings = get_settings()
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            username=settings.mqtt_username or None,
            password=settings.mqtt_password or None,
            identifier=f"{settings.mqtt_client_id}-cmd-{datetime.now(timezone.utc).timestamp():.0f}",
        ) as client:
            await client.publish(
                client_or_topic,
                json.dumps(payload),
                qos=qos,
                retain=False,
            )
            logger.info("Published command to %s", client_or_topic)
    except aiomqtt.MqttError as exc:
        logger.error("Failed to publish MQTT command: %s", exc)
        raise
