"""
IVaaRA – FastAPI Application Entry Point
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, analytics, devices, system
from app.api import ai as ai_router
from app.config import get_settings
from app.database import create_tables
from app.mqtt.client import mqtt_listener, register_telemetry_handler
from app.services.device_service import offline_monitor_loop, process_telemetry
from app.websocket.manager import ws_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()
_stop_event = asyncio.Event()
_background_tasks: list[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("IVaaRA backend starting...")

    # Initialize database
    await create_tables()
    logger.info("Database tables created/verified")

    # Seed default devices if none exist
    await _seed_default_devices()

    # Register telemetry pipeline
    register_telemetry_handler(process_telemetry)

    # Start background tasks
    _stop_event.clear()
    _background_tasks.append(
        asyncio.create_task(mqtt_listener(_stop_event), name="mqtt-listener")
    )
    _background_tasks.append(
        asyncio.create_task(offline_monitor_loop(_stop_event), name="offline-monitor")
    )
    logger.info("Background tasks started")

    yield

    # Shutdown
    logger.info("IVaaRA backend shutting down...")
    _stop_event.set()
    for task in _background_tasks:
        task.cancel()
    await asyncio.gather(*_background_tasks, return_exceptions=True)
    logger.info("Shutdown complete")


async def _seed_default_devices() -> None:
    """Seed 3 beds; only BED-101 has an active IV device (the real ESP32)."""
    from app.database import get_db
    from app.models import Device, Bed
    from sqlalchemy import select, func

    async with get_db() as session:
        count = (await session.execute(
            select(func.count(Device.id))
        )).scalar() or 0

        if count > 0:
            return

        logger.info("Seeding 3 beds (1 active IV device)...")

        beds = [
            Bed(bed_id="BED-101", ward="ICU Ward A", patient_name="Unassigned"),
            Bed(bed_id="BED-102", ward="ICU Ward A", patient_name="Unassigned"),
            Bed(bed_id="BED-103", ward="ICU Ward A", patient_name="Unassigned"),
        ]
        for bed in beds:
            session.add(bed)
        await session.flush()

        # Only ONE device — the physical ESP32 on BED-101
        devices = [
            Device(
                device_id="IV-001",
                name="IV Monitor — Bed 101",
                bed_id=beds[0].id,
                mqtt_topic_prefix="ivara/device/IV-001",
                iv_type="Normal Saline 0.9%",
                initial_volume_ml=500.0,
                status="OFFLINE",
                firmware_version="1.0.0",
            ),
        ]
        for device in devices:
            session.add(device)
        await session.flush()
        logger.info("Seeded: BED-101 with IV-001 (ESP32). BED-102, BED-103 are empty.")



# ──────────────────────────────────────────────────────────────
# FastAPI Application
# ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="IVaaRA API",
    description="Intra Venous Automation and Response Architecture — Backend API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(devices.router)
app.include_router(alerts.router)
app.include_router(system.router)
app.include_router(analytics.router)
app.include_router(ai_router.router)


# ──────────────────────────────────────────────────────────────
# WebSocket endpoint
# ──────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        # Send initial system status snapshot
        from app.database import get_db
        from app.models import Device, Alert
        from sqlalchemy import select, func

        async with get_db() as session:
            total = (await session.execute(select(func.count(Device.id)))).scalar() or 0
            online = (await session.execute(
                select(func.count(Device.id)).where(Device.status == "ONLINE")
            )).scalar() or 0
            active = (await session.execute(
                select(func.count(Alert.id)).where(Alert.status == "ACTIVE")
            )).scalar() or 0
            from app.mqtt.client import get_mqtt_status
            mqtt = get_mqtt_status()

        await ws.send_text(
            __import__("json").dumps({
                "type": "connected",
                "data": {
                    "total_devices": total,
                    "online_devices": online,
                    "active_alerts": active,
                    "mqtt_connected": mqtt["connected"],
                },
                "timestamp": __import__("datetime").datetime.now(
                    __import__("datetime").timezone.utc
                ).isoformat(),
            })
        )

        # Keep alive — listen for client pings
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
                if data == "ping":
                    await ws.send_text('{"type":"pong"}')
            except asyncio.TimeoutError:
                await ws.send_text('{"type":"heartbeat"}')
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(ws)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ivara-backend"}
