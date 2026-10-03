"""
IVaaRA – WebSocket Connection Manager
Broadcasts real-time telemetry, alerts, and status to all connected frontend clients.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.schemas.schemas import WSMessage

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.info("WebSocket client connected. Total: %d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.info("WebSocket client disconnected. Total: %d", len(self._connections))

    async def broadcast(
        self,
        msg_type: str,
        data: Dict[str, Any],
        device_id: Optional[str] = None,
    ) -> None:
        """Broadcast a message to all connected clients."""
        msg = WSMessage(
            type=msg_type,
            device_id=device_id,
            data=data,
            timestamp=datetime.now(timezone.utc),
        )
        payload = msg.model_dump_json()

        dead: Set[WebSocket] = set()
        for ws in list(self._connections):
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(payload)
                else:
                    dead.add(ws)
            except Exception as exc:
                logger.warning("Failed to send to WebSocket client: %s", exc)
                dead.add(ws)

        for ws in dead:
            self._connections.discard(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Singleton used throughout the app
ws_manager = ConnectionManager()
