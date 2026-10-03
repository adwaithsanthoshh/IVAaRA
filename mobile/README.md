# IVaaRA Mobile App

React Native + Expo Go mobile client for IVaaRA (Intra Venous Automation & Response Architecture).

## Setup

### 1. Prerequisites

- Install [Expo Go](https://expo.dev/go) on your iPhone or Android phone
- Node.js 18+
- Phone and computer must be on the **same Wi-Fi network**

### 2. Configure backend URL

```bash
cp .env.example .env
```

Edit `.env` and replace `YOUR_COMPUTER_LAN_IP` with your computer's LAN IP:

```
EXPO_PUBLIC_API_URL=http://192.168.1.XX:8000
```

Find your LAN IP:
- **Mac**: `ifconfig | grep "inet " | grep -v 127.0.0.1`
- **Linux**: `ip addr show`

> ⚠️ Never use `localhost` — your phone can't reach your computer that way.

### 3. Install and run

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go.

## Architecture

```
Expo Go App
    │
    ▼ HTTP (LAN)
Backend FastAPI :8000
    │
    ├── /api/devices     → device status, telemetry
    ├── /api/alerts      → alert feed
    ├── /api/ai/chat     → AI Q&A (Groq, assembled on backend)
    ├── /api/ai/insight  → AI risk analysis
    └── /api/system      → system status
```

The mobile app **never** communicates directly with:
- The ESP32
- Groq API (all AI calls are proxied through the backend)
- MQTT broker

## Screens

| Screen | Description |
|--------|-------------|
| Dashboard | System status + all device cards |
| Devices | Sortable device list |
| Alerts | Alert feed with severity filter |
| AI Chat | Ask questions about any device via Groq |
| Settings | Backend URL, AI status, app info |
| Device Detail | Full telemetry, risk, AI insight, emergency stop |

## AI Chat

The AI Chat tab sends your question to `POST /api/ai/chat`. The backend:
1. Fetches real telemetry context from the database
2. Constructs a safe prompt
3. Calls Groq API
4. Returns the sanitized answer

**Your Groq API key never leaves the backend.**

## Emergency Stop

The Emergency Stop button on the Device Detail screen sends `POST /api/devices/{id}/emergency-stop` which publishes an MQTT command to the ESP32.
