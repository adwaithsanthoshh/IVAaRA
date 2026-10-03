# IVAaRA — Intra Venous Automation & Response Architecture

> **Local-first, self-hosted IV monitoring and automation platform for clinical environments.**

IVAaRA is a medical-device hackathon prototype designed to monitor and control IV infusion flow in real-time. By utilizing an ESP32 microcontroller and a robust FastAPI/React/Mosquitto backend architecture, IVAaRA replaces manual monitoring with an automated system. It provides real-time telemetry (flow rate, temperature, volume), risk analysis, an intelligent AI layer using Groq for anomaly detection, and automated fail-safes (like an Emergency Stop).

The system consists of:
- **Hardware:** ESP32 with sensors and a servo motor for flow control.
- **Backend:** FastAPI for data processing, rule-based risk engines, and AI integration.
- **Frontend:** A React+TypeScript web dashboard and an Expo React Native mobile app for nurses/doctors.
- **Messaging:** MQTT via Mosquitto for reliable low-latency device communication.

[![Backend](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](backend/)
[![Frontend](https://img.shields.io/badge/React-TypeScript-61DAFB?logo=react)](frontend/)
[![Mobile](https://img.shields.io/badge/Expo-React_Native-000000?logo=expo)](mobile/)
[![MQTT](https://img.shields.io/badge/Mosquitto-2.0-EE8100?logo=eclipse-mosquitto)](mosquitto/)

---


## Architecture

```
                    ┌─────────────────┐
                    │    Frontend     │
                    │  React + Vite   │
                    └────────┬────────┘
                             │  REST / WebSocket
                    ┌────────▼────────┐
                    │    FastAPI      │
                    │    Backend      │
                    └───────┬─┬───────┘
                            │ │
                 ┌──────────┘ └──────────┐
                 │                       │
          ┌──────▼──────┐         ┌──────▼──────┐
          │  SQLite DB  │         │ Alert/Risk  │
          │  (→Postgres)│         │   Engine    │
          └─────────────┘         └─────────────┘
                 │
          ┌──────▼──────┐
          │    MQTT     │
          │  Mosquitto  │
          └──────┬──────┘
                 │
        ┌────────┼─────────┐
        │        │         │
     IV-001   IV-002    IV-003
     (ESP32) (Simulator)(Simulator)
```

**Critical Safety Principle:** The ESP32 maintains local safety control (flow monitoring, servo, alarm, emergency stop) *independently* of the network. The backend/dashboard is a monitoring and control interface — not the primary safety mechanism.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 20+ |
| Docker + Compose | 24+ (optional) |
| Mosquitto | 2.0+ (or Docker) |
| pip | latest |

---

## Installation

### 1. Clone and set up environment

```bash
git clone <repo>
cd ivara

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings (MQTT credentials, Telegram token, etc.)
```

### 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Frontend setup

```bash
cd frontend
npm install
```

---

## Running Locally (Development)

### Start Mosquitto

```bash
# Using Docker (recommended)
docker run -d --name ivara-mqtt \
  -p 1883:1883 \
  -v $(pwd)/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf \
  eclipse-mosquitto:2.0

# Or install locally on macOS
brew install mosquitto
mosquitto -c mosquitto/mosquitto.conf
```

### Start Backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Backend will start at **http://localhost:8000**
API docs at **http://localhost:8000/api/docs**

### Start Frontend

```bash
cd frontend
npm run dev
```

Frontend at **http://localhost:5173**

### Run Simulator (Demo without hardware)

```bash
cd <project root>
source backend/.venv/bin/activate

# Run single device
python simulator.py --device IV-001 --scenario normal

# Run all 3 demo devices simultaneously
python simulator.py --all

# Run a specific scenario
python simulator.py --device IV-001 --scenario stopped_flow
```

**Scenarios:**
| Scenario | What it demonstrates |
|----------|---------------------|
| `normal` | Steady nominal flow |
| `low_flow` | Flow drops, alert fires, recovers |
| `high_flow` | Flow above target, alert fires |
| `stopped_flow` | Flow → 0, CRITICAL alert |
| `temperature` | Temperature excursion |
| `sensor_failure` | Sensor ERROR state |
| `offline` | Device goes silent, backend marks OFFLINE |
| `auto_control` | PID-like correction simulation |

---

## Docker Setup (Production Demo)

```bash
# Start all services
docker compose up -d

# Then run simulator from host
python simulator.py --all

# View logs
docker compose logs -f backend
docker compose logs -f mqtt
```

Frontend served at **http://localhost:5173**

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./ivara.db` | Database connection string |
| `MQTT_HOST` | `localhost` | MQTT broker hostname |
| `MQTT_PORT` | `1883` | MQTT broker port |
| `MQTT_USERNAME` | _(empty)_ | MQTT username (if auth enabled) |
| `MQTT_PASSWORD` | _(empty)_ | MQTT password |
| `DEVICE_OFFLINE_TIMEOUT` | `30` | Seconds before device marked OFFLINE |
| `TELEGRAM_ENABLED` | `false` | Enable Telegram alerts |
| `TELEGRAM_BOT_TOKEN` | _(empty)_ | Telegram bot token |
| `TELEGRAM_CHAT_ID` | _(empty)_ | Telegram chat ID |
| `LLM_ENABLED` | `false` | Enable LLM analysis |
| `OPENAI_API_KEY` | _(empty)_ | OpenAI API key |
| `RISK_THRESHOLD_LOW` | `30` | Risk score threshold for MODERATE |
| `RISK_THRESHOLD_MODERATE` | `60` | Risk score threshold for HIGH |
| `RISK_THRESHOLD_HIGH` | `80` | Risk score threshold for CRITICAL |

---

## MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `ivara/device/{id}/telemetry` | ESP32 → Backend | Sensor data every 5s |
| `ivara/device/{id}/status` | ESP32 → Backend | Online/offline status (retained) |
| `ivara/device/{id}/command` | Backend → ESP32 | Control commands |
| `ivara/device/{id}/ack` | ESP32 → Backend | Command acknowledgement |
| `ivara/device/{id}/alert` | ESP32 → Backend | Device-local alerts |
| `ivara/backend/status` | Backend → All | Backend online/offline (retained) |

### Telemetry Payload

```json
{
  "device_id": "IV-001",
  "timestamp": "2026-10-03T06:14:43Z",
  "flow_rate": 24.0,
  "target_flow": 25.0,
  "temperature": 42.0,
  "remaining_volume_ml": 420.0,
  "servo_angle": 40,
  "automatic_control": true,
  "sensor_status": "OK"
}
```

### Command Payload (Backend → ESP32)

```json
{
  "command": "EMERGENCY_STOP",
  "event_id": "uuid-here",
  "timestamp": "2026-10-03T06:14:43Z",
  "operator": "RN. Sarah Jenkins"
}
```

```json
{
  "command": "SET_MODE",
  "mode": "AUTOMATIC",
  "target_flow": 25.0,
  "event_id": "uuid-here",
  "timestamp": "2026-10-03T06:14:43Z"
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List all devices |
| POST | `/api/devices` | Register a new device |
| GET | `/api/devices/{id}` | Device detail + latest telemetry |
| GET | `/api/devices/{id}/telemetry` | Paginated telemetry |
| GET | `/api/devices/{id}/history?hours=24` | Time-range history |
| GET | `/api/devices/{id}/risk` | Latest risk assessment |
| POST | `/api/devices/{id}/emergency-stop` | Send emergency stop |
| POST | `/api/devices/{id}/control-mode` | Set AUTOMATIC/MANUAL |
| GET | `/api/devices/{id}/calibration` | Flow calibration table |
| POST | `/api/devices/{id}/calibration` | Add calibration point |
| GET | `/api/alerts` | List alerts (filterable) |
| POST | `/api/alerts/{id}/acknowledge` | Acknowledge alert |
| GET | `/api/system/status` | System health overview |
| GET | `/api/analytics/summary/{id}` | Flow/temp statistics |

Full interactive docs: **http://localhost:8000/api/docs**

---

## Database

SQLite by default. Stored at `backend/ivara.db`.

**Switch to PostgreSQL:** Change `DATABASE_URL` in `.env`:
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/ivara
```
No code changes needed.

**Tables:**
- `devices` — Registered IV pump units
- `beds` — Bed/patient assignments
- `iv_sessions` — Active and historical infusion sessions
- `telemetry` — Time-series sensor data
- `alerts` — Alert log with acknowledgement tracking
- `risk_assessments` — Risk score history
- `device_events` — Commands, ACKs, mode changes
- `flow_calibrations` — Per-device servo angle ↔ flow rate mapping
- `system_configuration` — Key-value system config

---

## Arduino ESP32 Code (Placeholder)

> **Note:** The Arduino ESP32 C++ code will be uploaded and placed here (or in the `esp32/` directory) in the future.

```cpp
// -------------------------------------------------------------
// ESP32 Arduino Code Placeholder for IVAaRA
// The hardware implementation handles:
// - Flow rate sensing (e.g., optical drop sensor)
// - Temperature sensing
// - Servo motor control (pinch valve)
// - MQTT communication with Mosquitto broker
// - Local fail-safe logic
// -------------------------------------------------------------

// Code will be added here...
```

## Flashing ESP32

1. Open `esp32/ivara_device/ivara_device.ino` in Arduino IDE
2. Install libraries: `PubSubClient`, `ArduinoJson`, `ESP32Servo`
3. Set your WiFi credentials and MQTT broker IP in the config section
4. Set `DEVICE_ID` to match your device (e.g. `"IV-001"`)
5. Flash to ESP32

The ESP32 will:
- Auto-connect to WiFi and MQTT broker
- Publish telemetry every 5 seconds
- Subscribe to commands
- Maintain local safety monitoring regardless of connectivity

---

## Adding a New IV Device

1. **Register via API:**
   ```bash
   curl -X POST http://localhost:8000/api/devices \
     -H "Content-Type: application/json" \
     -d '{"device_id":"IV-004","name":"IV Pump 004","iv_type":"Normal Saline"}'
   ```

2. **Flash ESP32** with `DEVICE_ID = "IV-004"`

3. **Add calibration points:**
   ```bash
   curl -X POST http://localhost:8000/api/devices/IV-004/calibration \
     -H "Content-Type: application/json" \
     -d '{"servo_angle":40,"measured_flow_rate":24.0}'
   ```

4. Device appears automatically in the dashboard on first telemetry.

---

## Running Tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

---

## Safety Architecture

```
Priority 1 (Highest): ESP32 local hardware logic
    - Physical emergency stop button
    - Local flow/temperature alarm
    - Servo control
    - Operates independently of network

Priority 2: Local backend automation
    - Rule-based alert engine
    - Risk scoring
    - Automatic control commands via MQTT

Priority 3: LLM analysis (optional, read-only)
    - Summarizes telemetry history
    - Explains detected anomalies
    - Cannot issue any commands
```

**If network fails:** ESP32 continues monitoring and controlling locally.  
**If backend fails:** ESP32 continues; frontend cannot update but device stays safe.  
**If LLM is unavailable:** System continues with deterministic rules (no degradation).

---

## Demo Walkthrough

1. Start everything: `docker compose up -d && python simulator.py --all`
2. Open **http://localhost:5173**
3. See: IV-001 ONLINE, Flow: ~24 drops/min, Temp: ~42°C, Risk: LOW
4. Wait 30s → IV-002 triggers LOW_FLOW alert
5. See alert badge increment in sidebar
6. Go to Alerts page → Acknowledge the alert
7. Click Emergency Stop → Confirm → See STOP_REQUESTED → STOP_ACKNOWLEDGED
8. Stop simulator (`Ctrl+C`) → Wait 30s → Devices go OFFLINE
9. See DEVICE_OFFLINE alerts, status badges update to OFFLINE

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend can't connect to MQTT | Check Mosquitto is running on port 1883 |
| Device shows OFFLINE immediately | Increase `DEVICE_OFFLINE_TIMEOUT` in `.env` |
| Frontend can't reach backend | Verify backend is on port 8000, check CORS `ALLOWED_ORIGINS` |
| No telemetry appearing | Run `python simulator.py --device IV-001` to generate data |
| Alert count not updating | Check WebSocket connection (green sync indicator in header) |
| Database locked errors | Stop all backend instances, only run one at a time with SQLite |
