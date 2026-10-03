# IVAaRA
# Intra Venous Automation and Response Architecture

> An affordable, IoT-enabled IV monitoring and flow-control system that combines embedded sensing, deterministic control, real-time telemetry, web/mobile monitoring, explainable alerts, and Groq-powered AI analysis.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Proposed Solution](#3-proposed-solution)
4. [System Architecture](#4-system-architecture)
5. [Hardware & Firmware](#5-hardware--firmware)
6. [Backend API](#6-backend-api)
7. [Web Dashboard & Mobile App](#7-web-dashboard--mobile-app)
8. [Groq AI Layer](#8-groq-ai-layer)
9. [Safety Architecture](#9-safety-architecture)
10. [Setup & Installation](#10-setup--installation)
11. [Arduino ESP32 Code (Placeholder)](#11-arduino-esp32-code-placeholder)

---

## 1. Project Overview

IVAaRA stands for **Intra Venous Automation and Response Architecture**.

IVAaRA is a smart IV monitoring platform designed to continuously observe IV fluid flow, detect abnormal flow conditions, provide real-time alerts, and present understandable information to nurses and doctors.

The system combines:
- IR-based drop detection & ESP32 embedded processing
- Servo-based IV flow regulation
- Deterministic threshold monitoring
- MQTT telemetry & Backend processing
- Real-time web dashboard & Expo mobile application
- Groq AI analysis & AI-generated explanations

## 2. Problem Statement

Manual monitoring of IV infusions in clinical settings is labor-intensive and prone to human error. Unnoticed flow blockages, empty fluid bags, or incorrect flow rates can lead to severe patient complications. Continuous, automated, and intelligent monitoring is required to improve patient safety and reduce the cognitive load on healthcare professionals.

## 3. Proposed Solution

IVAaRA retrofits existing IV setups with an affordable, IoT-enabled device that:
1. **Monitors:** Precisely counts IV drops using IR sensors.
2. **Analyzes:** Streams telemetry via MQTT to a central backend for deterministic rule evaluation and Groq-powered AI risk assessment.
3. **Controls:** Automatically adjusts flow using a servo-actuated pinch valve to maintain target rates.
4. **Alerts:** Provides instant, explainable alerts via Web and Mobile interfaces.

## 4. System Architecture

```text
IV SET
   |
   v
IR DROP SENSOR
   |
   v
ESP32 (Hardware/Firmware)
   |
   +----------------------+
   |                      |
   v                      v
FLOW CALCULATION      SERVO CONTROL
   |                      |
   +----------+-----------+
              |
              v
             MQTT (Mosquitto)
              |
              v
           BACKEND (FastAPI)
              |
        +-----+-----+
        |           |
        v           v
    DATABASE     GROQ AI
        |           |
        +-----+-----+
              |
      +-------+-------+
      |               |
      v               v
    WEB             MOBILE
 DASHBOARD           APP
```

## 5. Hardware & Firmware

- **IR-Based Drop Detection:** Uses an infrared transmitter-receiver pair to detect the passing of fluid drops.
- **Flow Rate Calculation:** The ESP32 calculates drops-per-minute (d/min) locally.
- **Servo-Based Flow Control:** A micro-servo acts as a pinch valve on the IV tubing, adjusting the restriction to maintain target flow rates.
- **MQTT Communication:** The ESP32 publishes telemetry (flow rate, temperature, volume) every 5 seconds and subscribes to command topics for remote control.

## 6. Backend API

Built with **FastAPI**, the backend acts as the central nervous system:
- Ingests MQTT telemetry.
- Persists data to SQLite (or PostgreSQL).
- Evaluates deterministic alerts (e.g., HIGH_FLOW, LOW_FLOW, STOPPED).
- Proxies requests to the Groq AI service.
- Serves REST and WebSocket endpoints for the frontend and mobile apps.

## 7. Web Dashboard & Mobile App

- **Web Dashboard (React + TypeScript):** A comprehensive interface for nurses to monitor all active beds, view live telemetry graphs, acknowledge alerts, and engage with the AI assistant.
- **Mobile Application (Expo React Native):** A dedicated mobile client allowing healthcare staff to monitor IV statuses on the go, complete with real-time updates and emergency stop capabilities.

## 8. Groq AI Layer

The Groq AI layer adds intelligent, explainable oversight to the deterministic system:
- **Flow Trend & Risk Analysis:** Analyzes telemetry history to identify subtle anomalies (e.g., gradual flow degradation).
- **Explainable Alerts:** Translates raw data into human-readable clinical summaries.
- **Ask IVAaRA AI:** A chat interface allowing medical staff to query the AI about specific device histories and anomalies.
- **Guardrail Layer:** Ensures all AI outputs strictly adhere to expected JSON formats and safe medical disclaimer boundaries.
- **Failure Fallback:** A 3-key failover pool ensures high availability; if the AI service fails entirely, the system gracefully degrades to deterministic rules.

## 9. Safety Architecture

```text
Priority 1 (Highest): ESP32 local hardware logic
    - Physical emergency stop
    - Local flow/temperature alarm
    - Operates independently of network

Priority 2: Local backend automation
    - Rule-based alert engine
    - Deterministic risk scoring

Priority 3: Groq AI analysis (optional, read-only)
    - Summarizes telemetry history
    - Cannot issue automated control commands
```

**If network fails:** ESP32 continues monitoring and controlling locally.
**If backend fails:** ESP32 continues safe local operation.
**If AI is unavailable:** System continues with deterministic rules.

## 10. Setup & Installation

### Environment Configuration
Copy `.env.example` to `.env` and set your Groq API keys:
```
GROQ_API_KEY_1=gsk_your_key_here
```

### Docker Deployment
Run the complete stack (Mosquitto, FastAPI Backend, React Frontend):
```bash
docker compose up -d --build
```
- **Web Dashboard:** http://localhost:5173
- **API Docs:** http://localhost:8000/api/docs

### Mobile App (Expo)
Ensure your phone and computer are on the same Wi-Fi. Set `EXPO_PUBLIC_API_URL` to your computer's LAN IP.
```bash
cd mobile
npm install
npx expo start
```

## 11. Arduino ESP32 Code (Placeholder)

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
