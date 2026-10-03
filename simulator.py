#!/usr/bin/env python3
"""
IVaaRA – ESP32 Device Simulator
Publishes realistic IV telemetry via MQTT exactly as the real ESP32 would.

Usage:
  python simulator.py --device IV-001
  python simulator.py --device IV-001 --scenario low_flow
  python simulator.py --device IV-001 --scenario offline_recovery
  python simulator.py --all   (run IV-001, IV-002, IV-003 simultaneously)

Scenarios:
  normal          – steady flow near target (default)
  low_flow        – flow drops below threshold
  high_flow       – flow rises above threshold
  stopped_flow    – flow goes to 0
  temperature     – temperature excursion
  sensor_failure  – sensor reports ERROR
  offline         – stops publishing for 40s then recovers
  auto_control    – simulates PID correcting flow deviations
"""
import argparse
import asyncio
import json
import logging
import math
import random
import time
from datetime import datetime, timezone
from typing import Optional

import aiomqtt

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("simulator")

# Default broker settings (override with env/args)
MQTT_HOST = "localhost"
MQTT_PORT = 1883


class DeviceState:
    def __init__(self, device_id: str, scenario: str = "normal"):
        self.device_id = device_id
        self.scenario = scenario
        self.target_flow: float = 25.0       # drops/min
        self.current_flow: float = 24.0
        self.temperature: float = 42.0
        self.remaining_volume_ml: float = 420.0
        self.servo_angle: int = 40
        self.automatic_control: bool = True
        self.sensor_status: str = "OK"
        self.tick: int = 0
        self._scenario_start = time.monotonic()

    def update(self) -> None:
        """Advance simulation by one tick (5s telemetry interval)."""
        self.tick += 1
        elapsed = time.monotonic() - self._scenario_start

        if self.scenario == "normal":
            self._normal_update()
        elif self.scenario == "low_flow":
            self._low_flow_update(elapsed)
        elif self.scenario == "high_flow":
            self._high_flow_update(elapsed)
        elif self.scenario == "stopped_flow":
            self._stopped_flow_update(elapsed)
        elif self.scenario == "temperature":
            self._temperature_excursion_update(elapsed)
        elif self.scenario == "sensor_failure":
            self._sensor_failure_update(elapsed)
        elif self.scenario == "auto_control":
            self._auto_control_update(elapsed)
        else:
            self._normal_update()

        # Drain volume at a realistic rate (~0.25 mL per drop at 25 drops/min → ~1.5 mL/tick)
        drain = (self.current_flow / 60.0) * 5.0 * 0.2  # 5s interval, ~0.2 mL/drop
        self.remaining_volume_ml = max(0.0, self.remaining_volume_ml - drain)

        # Add tiny noise to all continuous values
        self.temperature += random.gauss(0, 0.05)
        self.temperature = round(max(35.0, min(48.0, self.temperature)), 2)

    def _normal_update(self) -> None:
        # Gently oscillate flow ±1 drop/min around target
        t = self.tick * 0.3
        self.current_flow = self.target_flow + math.sin(t) * 0.8 + random.gauss(0, 0.2)
        self.current_flow = round(max(0, self.current_flow), 1)
        self.servo_angle = 40

    def _low_flow_update(self, elapsed: float) -> None:
        if elapsed < 30:
            self.current_flow = round(14.0 + random.gauss(0, 0.3), 1)
            self.servo_angle = 65
        else:
            # Recover
            self.current_flow = round(self.target_flow + random.gauss(0, 0.2), 1)
            self.servo_angle = 40

    def _high_flow_update(self, elapsed: float) -> None:
        if elapsed < 30:
            self.current_flow = round(38.0 + random.gauss(0, 0.3), 1)
            self.servo_angle = 20
        else:
            self.current_flow = round(self.target_flow + random.gauss(0, 0.2), 1)
            self.servo_angle = 40

    def _stopped_flow_update(self, elapsed: float) -> None:
        if elapsed < 45:
            self.current_flow = 0.0
            self.servo_angle = 90
        else:
            # Recover
            self.current_flow = round(self.target_flow + random.gauss(0, 0.2), 1)
            self.servo_angle = 40

    def _temperature_excursion_update(self, elapsed: float) -> None:
        self._normal_update()
        if elapsed < 40:
            self.temperature = round(48.5 + random.gauss(0, 0.1), 2)
        else:
            self.temperature = 42.0

    def _sensor_failure_update(self, elapsed: float) -> None:
        self._normal_update()
        if elapsed < 50:
            self.sensor_status = "ERROR"
            self.current_flow = random.choice([0.0, -1.0, 999.0])  # garbage values
        else:
            self.sensor_status = "OK"
            self.current_flow = round(self.target_flow + random.gauss(0, 0.2), 1)

    def _auto_control_update(self, elapsed: float) -> None:
        """Simulate a PI-controlled flow with external disturbance."""
        if elapsed < 20:
            # Introduce disturbance
            self.current_flow = round(16.0 + random.gauss(0, 0.3), 1)
        elif elapsed < 40:
            # Controller responding — flow recovering
            progress = (elapsed - 20) / 20.0
            self.current_flow = round(16.0 + progress * (self.target_flow - 16.0) + random.gauss(0, 0.2), 1)
            self.servo_angle = max(20, int(40 - (1 - progress) * 20))
        else:
            # Settled
            self.current_flow = round(self.target_flow + random.gauss(0, 0.2), 1)
            self.servo_angle = 40

    def to_payload(self) -> dict:
        return {
            "device_id": self.device_id,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "flow_rate": round(max(0, self.current_flow), 1),
            "target_flow": self.target_flow,
            "temperature": round(self.temperature, 2),
            "remaining_volume_ml": round(self.remaining_volume_ml, 1),
            "servo_angle": self.servo_angle,
            "automatic_control": self.automatic_control,
            "sensor_status": self.sensor_status,
        }


async def run_device(
    device_id: str,
    scenario: str,
    host: str,
    port: int,
    interval: float = 5.0,
    stop_event: Optional[asyncio.Event] = None,
) -> None:
    state = DeviceState(device_id, scenario)
    logger.info("Starting simulator: device=%s scenario=%s", device_id, scenario)

    offline_mode = scenario == "offline"

    while stop_event is None or not stop_event.is_set():
        try:
            async with aiomqtt.Client(hostname=host, port=port) as client:
                # Announce device online
                await client.publish(
                    f"ivara/device/{device_id}/status",
                    json.dumps({"device_id": device_id, "status": "ONLINE"}),
                    qos=1,
                    retain=True,
                )
                logger.info("[%s] Connected to MQTT broker", device_id)

                # Subscribe to commands directed at this device
                await client.subscribe(f"ivara/device/{device_id}/command", qos=1)

                # Publish telemetry loop
                async def publish_loop():
                    if offline_mode:
                        # Run for 15s, then go silent for 40s, repeat
                        for _ in range(3):
                            state.update()
                            payload = state.to_payload()
                            await client.publish(
                                f"ivara/device/{device_id}/telemetry",
                                json.dumps(payload),
                                qos=1,
                            )
                            logger.info("[%s] Telemetry: flow=%.1f temp=%.1f vol=%.0f",
                                       device_id, payload["flow_rate"], payload["temperature"],
                                       payload["remaining_volume_ml"])
                            await asyncio.sleep(interval)
                        logger.info("[%s] Going OFFLINE for 40s...", device_id)
                        await asyncio.sleep(40)
                        logger.info("[%s] Coming back ONLINE", device_id)
                    else:
                        while True:
                            state.update()
                            payload = state.to_payload()
                            await client.publish(
                                f"ivara/device/{device_id}/telemetry",
                                json.dumps(payload),
                                qos=1,
                            )
                            logger.info("[%s] Telemetry: flow=%.1f temp=%.1f vol=%.0f",
                                       device_id, payload["flow_rate"], payload["temperature"],
                                       payload["remaining_volume_ml"])
                            await asyncio.sleep(interval)

                async def command_listener():
                    async for msg in client.messages:
                        try:
                            cmd = json.loads(msg.payload.decode())
                            logger.info("[%s] Received command: %s", device_id, cmd)
                            await _handle_command(client, device_id, state, cmd)
                        except Exception as e:
                            logger.warning("[%s] Command parse error: %s", device_id, e)

                await asyncio.gather(publish_loop(), command_listener())

        except aiomqtt.MqttError as e:
            logger.warning("[%s] MQTT error: %s — retrying in 5s", device_id, e)
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("[%s] Unexpected error: %s — retrying in 10s", device_id, e)
            await asyncio.sleep(10)

    logger.info("[%s] Simulator stopped", device_id)


async def _handle_command(client: aiomqtt.Client, device_id: str, state: DeviceState, cmd: dict) -> None:
    """Process a command from the backend and send acknowledgement."""
    command = cmd.get("command", "")
    event_id = cmd.get("event_id", "")

    if command == "EMERGENCY_STOP":
        logger.warning("[%s] EMERGENCY STOP received!", device_id)
        state.current_flow = 0.0
        state.servo_angle = 90
        state.automatic_control = False
        ack_status = "STOP_ACKNOWLEDGED"

    elif command == "SET_MODE":
        mode = cmd.get("mode", "AUTOMATIC")
        if mode == "AUTOMATIC":
            state.automatic_control = True
        elif mode == "MANUAL":
            state.automatic_control = False
            if cmd.get("servo_angle") is not None:
                state.servo_angle = cmd["servo_angle"]
        elif mode == "EMERGENCY_STOP":
            state.current_flow = 0.0
            state.servo_angle = 90
            state.automatic_control = False
        if cmd.get("target_flow") is not None:
            state.target_flow = cmd["target_flow"]
        ack_status = "ACKNOWLEDGED"

    else:
        ack_status = "UNKNOWN_COMMAND"

    ack_payload = {
        "device_id": device_id,
        "event_id": event_id,
        "command": command,
        "status": ack_status,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    await client.publish(
        f"ivara/device/{device_id}/ack",
        json.dumps(ack_payload),
        qos=1,
    )
    logger.info("[%s] Command ACK sent: %s", device_id, ack_status)


async def main():
    parser = argparse.ArgumentParser(description="IVaaRA Device Simulator")
    parser.add_argument("--device", default="IV-001", help="Device ID (e.g. IV-001)")
    parser.add_argument(
        "--scenario",
        default="normal",
        choices=["normal", "low_flow", "high_flow", "stopped_flow",
                 "temperature", "sensor_failure", "offline", "auto_control"],
        help="Simulation scenario",
    )
    parser.add_argument("--all", action="store_true", help="Run IV-001, IV-002, IV-003 simultaneously")
    parser.add_argument("--host", default=MQTT_HOST, help="MQTT broker host")
    parser.add_argument("--port", type=int, default=MQTT_PORT, help="MQTT broker port")
    parser.add_argument("--interval", type=float, default=5.0, help="Telemetry interval (seconds)")
    args = parser.parse_args()

    stop_event = asyncio.Event()

    if args.all:
        devices_configs = [
            ("IV-001", "normal"),
            ("IV-002", "low_flow"),
            ("IV-003", "auto_control"),
        ]
        tasks = [
            asyncio.create_task(
                run_device(dev_id, scenario, args.host, args.port, args.interval, stop_event)
            )
            for dev_id, scenario in devices_configs
        ]
        logger.info("Running all devices: IV-001 (normal), IV-002 (low_flow), IV-003 (auto_control)")
    else:
        tasks = [
            asyncio.create_task(
                run_device(args.device, args.scenario, args.host, args.port, args.interval, stop_event)
            )
        ]

    try:
        await asyncio.gather(*tasks)
    except KeyboardInterrupt:
        logger.info("Stopping simulator...")
        stop_event.set()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
