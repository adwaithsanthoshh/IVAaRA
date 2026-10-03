/*
 * IVaaRA – ESP32 Firmware
 * Intra Venous Automation and Response Architecture
 *
 * Architecture:
 *   Sensor acquisition → Flow calculation → Control algorithm
 *   → MQTT publish → Command receive → Safety logic
 *
 * The ESP32 maintains local safety operation even if Wi-Fi/MQTT is lost.
 */

// ─────────────────────────────────────────────────────────────────────
// CONFIGURATION — Set these for your deployment
// ─────────────────────────────────────────────────────────────────────
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// Network credentials (use provisioning or NVS in production)
const char* WIFI_SSID     = "YOUR_SSID";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

// MQTT broker — your local server IP
const char* MQTT_HOST     = "192.168.1.100";
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "";
const char* MQTT_PASS     = "";
const char* DEVICE_ID     = "IV-001";

// ─────────────────────────────────────────────────────────────────────
// PIN DEFINITIONS
// ─────────────────────────────────────────────────────────────────────
const int FLOW_SENSOR_PIN     = 34;  // IR optical drop detector (ADC)
const int TEMP_SENSOR_PIN     = 35;  // PT100 / NTC thermistor (ADC)
const int SERVO_PIN           = 18;  // Servo for IV clamp
const int BUZZER_PIN          = 19;  // Alarm buzzer
const int LED_STATUS_PIN      = 2;   // Status LED (built-in)
const int LED_ALARM_PIN       = 4;   // Red alarm LED
const int ESTOP_BUTTON_PIN    = 0;   // Physical emergency stop (BOOT button)

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────
const int   TELEMETRY_INTERVAL_MS = 5000;  // 5 second telemetry interval
const int   FLOW_SAMPLE_WINDOW_MS = 5000;  // 5 second drop count window
const float FLOW_STOPPED_THRESHOLD = 1.0; // drops/min below this = STOPPED
const float TEMP_MIN = 35.0;
const float TEMP_MAX = 46.0;
const int   SERVO_OPEN   = 0;    // Fully open
const int   SERVO_CLOSED = 90;   // Emergency stop position

// MQTT topics
char TOPIC_TELEMETRY[64];
char TOPIC_STATUS[64];
char TOPIC_COMMAND[64];
char TOPIC_ACK[64];

// ─────────────────────────────────────────────────────────────────────
// DEVICE STATE
// ─────────────────────────────────────────────────────────────────────
enum ControlMode { AUTO, MANUAL, EMERGENCY_STOP_MODE };

struct DeviceState {
  float   flow_rate          = 0.0;
  float   target_flow        = 25.0;
  float   temperature        = 42.0;
  float   remaining_volume   = 500.0;
  int     servo_angle        = 40;
  bool    automatic_control  = true;
  String  sensor_status      = "OK";
  ControlMode mode           = AUTO;
  bool    emergency_stopped  = false;
  int     drop_count         = 0;
  unsigned long last_drop_time = 0;
  unsigned long last_telemetry_ms = 0;
};

// ─────────────────────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────────────────────
WiFiClient    wifiClient;
PubSubClient  mqtt(wifiClient);
Servo         clampServo;
DeviceState   state;
bool          lastEStopButton = HIGH;  // Active LOW

// Flow sensor ISR counter
volatile int dropISRCount = 0;
void IRAM_ATTR flowPulseISR() { dropISRCount++; }

// ─────────────────────────────────────────────────────────────────────
// FLOW SENSOR (abstracted)
// ─────────────────────────────────────────────────────────────────────
float readFlowRate() {
  // Uses interrupt-driven drop count over 5s window
  static unsigned long windowStart = 0;
  static int           lastCount   = 0;

  unsigned long now = millis();
  if (now - windowStart >= FLOW_SAMPLE_WINDOW_MS) {
    int drops = dropISRCount - lastCount;
    lastCount = dropISRCount;
    windowStart = now;
    // drops/min = drops per window * (60000 / window_ms)
    float rate = (float)drops * (60000.0f / FLOW_SAMPLE_WINDOW_MS);
    return max(0.0f, rate);
  }
  // Return last calculated value between windows
  return state.flow_rate;
}

// ─────────────────────────────────────────────────────────────────────
// TEMPERATURE SENSOR (abstracted – NTC thermistor example)
// ─────────────────────────────────────────────────────────────────────
float readTemperature() {
  int raw = analogRead(TEMP_SENSOR_PIN);
  // Steinhart-Hart simplified for NTC 10kΩ @ 25°C (B=3950)
  // Replace with PT100 lookup for medical-grade sensor
  float voltage = raw * (3.3f / 4095.0f);
  float resistance = 10000.0f * voltage / (3.3f - voltage);
  float logR = log(resistance / 10000.0f);
  float tempK = 1.0f / (0.001129148f + 0.000234125f * logR + 0.0000000876741f * logR * logR * logR);
  return tempK - 273.15f;
}

// ─────────────────────────────────────────────────────────────────────
// SERVO CONTROL
// ─────────────────────────────────────────────────────────────────────
void setServoAngle(int angle) {
  angle = constrain(angle, 0, 180);
  state.servo_angle = angle;
  clampServo.write(angle);
}

void executeEmergencyStop() {
  state.mode              = EMERGENCY_STOP_MODE;
  state.automatic_control = false;
  state.emergency_stopped = true;
  setServoAngle(SERVO_CLOSED);
  // Activate alarm
  digitalWrite(LED_ALARM_PIN, HIGH);
  tone(BUZZER_PIN, 2000, 500);
  Serial.println("[SAFETY] EMERGENCY STOP ACTIVATED");
}

// ─────────────────────────────────────────────────────────────────────
// AUTOMATIC FLOW CONTROL (simple proportional)
// ─────────────────────────────────────────────────────────────────────
void runAutoControl() {
  if (!state.automatic_control || state.emergency_stopped) return;

  float error = state.target_flow - state.flow_rate;
  // Simple proportional: each 1 drop/min error → adjust servo by ~0.5°
  // Device-specific calibration should replace this constant
  float adjustment = error * 0.5f;
  int newAngle = state.servo_angle - (int)adjustment; // decrease angle = more open
  newAngle = constrain(newAngle, 0, 80);
  setServoAngle(newAngle);
}

// ─────────────────────────────────────────────────────────────────────
// SAFETY CHECKS (run every loop iteration regardless of connectivity)
// ─────────────────────────────────────────────────────────────────────
void runLocalSafetyChecks() {
  // 1. Physical emergency stop button (active LOW)
  bool btnState = digitalRead(ESTOP_BUTTON_PIN);
  if (btnState == LOW && lastEStopButton == HIGH) {
    executeEmergencyStop();
    lastEStopButton = LOW;
  }
  if (btnState == HIGH) lastEStopButton = HIGH;

  // 2. Flow stopped alarm (local — does not require MQTT)
  if (state.flow_rate < FLOW_STOPPED_THRESHOLD && !state.emergency_stopped) {
    tone(BUZZER_PIN, 1500, 200);
  }

  // 3. Temperature out of range alarm
  if (state.temperature < TEMP_MIN || state.temperature > TEMP_MAX) {
    tone(BUZZER_PIN, 1000, 100);
  }
}

// ─────────────────────────────────────────────────────────────────────
// MQTT
// ─────────────────────────────────────────────────────────────────────
void publishTelemetry() {
  if (!mqtt.connected()) return;

  StaticJsonDocument<256> doc;
  doc["device_id"]          = DEVICE_ID;
  doc["timestamp"]          = ""; // ESP32 time via NTP in production
  doc["flow_rate"]          = state.flow_rate;
  doc["target_flow"]        = state.target_flow;
  doc["temperature"]        = state.temperature;
  doc["remaining_volume_ml"]= state.remaining_volume;
  doc["servo_angle"]        = state.servo_angle;
  doc["automatic_control"]  = state.automatic_control;
  doc["sensor_status"]      = state.sensor_status;

  char payload[256];
  serializeJson(doc, payload);
  mqtt.publish(TOPIC_TELEMETRY, payload, false);
}

void publishAck(const char* eventId, const char* status) {
  StaticJsonDocument<128> doc;
  doc["device_id"] = DEVICE_ID;
  doc["event_id"]  = eventId;
  doc["status"]    = status;
  char payload[128];
  serializeJson(doc, payload);
  mqtt.publish(TOPIC_ACK, payload, false);
}

void handleCommand(const char* payload, int length) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[MQTT] JSON parse error: %s\n", err.c_str());
    return;
  }

  const char* command  = doc["command"]  | "";
  const char* eventId  = doc["event_id"] | "";

  if (strcmp(command, "EMERGENCY_STOP") == 0) {
    executeEmergencyStop();
    publishAck(eventId, "STOP_ACKNOWLEDGED");
  }
  else if (strcmp(command, "SET_MODE") == 0) {
    const char* mode = doc["mode"] | "AUTOMATIC";
    if (strcmp(mode, "AUTOMATIC") == 0) {
      state.automatic_control = true;
      state.mode = AUTO;
      if (doc.containsKey("target_flow")) state.target_flow = doc["target_flow"].as<float>();
    }
    else if (strcmp(mode, "MANUAL") == 0) {
      state.automatic_control = false;
      state.mode = MANUAL;
      if (doc.containsKey("servo_angle")) setServoAngle(doc["servo_angle"].as<int>());
    }
    else if (strcmp(mode, "EMERGENCY_STOP") == 0) {
      executeEmergencyStop();
    }
    publishAck(eventId, "ACKNOWLEDGED");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Received on %s (%d bytes)\n", topic, length);
  if (strcmp(topic, TOPIC_COMMAND) == 0) {
    handleCommand((char*)payload, length);
  }
}

bool connectMQTT() {
  if (mqtt.connected()) return true;
  Serial.print("[MQTT] Connecting...");
  char willTopic[64];
  snprintf(willTopic, sizeof(willTopic), "%s", TOPIC_STATUS);
  String willPayload = "{\"status\":\"OFFLINE\",\"device_id\":\"" + String(DEVICE_ID) + "\"}";
  bool ok = mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS,
                         willTopic, 1, true, willPayload.c_str());
  if (ok) {
    Serial.println(" connected");
    mqtt.subscribe(TOPIC_COMMAND);
    // Announce online
    String onlineMsg = "{\"status\":\"ONLINE\",\"device_id\":\"" + String(DEVICE_ID) + "\"}";
    mqtt.publish(TOPIC_STATUS, onlineMsg.c_str(), true);
  } else {
    Serial.printf(" failed rc=%d\n", mqtt.state());
  }
  return ok;
}

void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Failed – continuing in offline mode");
  }
}

// ─────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n[IVaaRA] ESP32 Firmware v1.0.0 starting...");

  // Build topic strings
  snprintf(TOPIC_TELEMETRY, sizeof(TOPIC_TELEMETRY), "ivara/device/%s/telemetry", DEVICE_ID);
  snprintf(TOPIC_STATUS,    sizeof(TOPIC_STATUS),    "ivara/device/%s/status",    DEVICE_ID);
  snprintf(TOPIC_COMMAND,   sizeof(TOPIC_COMMAND),   "ivara/device/%s/command",   DEVICE_ID);
  snprintf(TOPIC_ACK,       sizeof(TOPIC_ACK),       "ivara/device/%s/ack",       DEVICE_ID);

  // GPIO setup
  pinMode(LED_STATUS_PIN, OUTPUT);
  pinMode(LED_ALARM_PIN,  OUTPUT);
  pinMode(ESTOP_BUTTON_PIN, INPUT_PULLUP);
  pinMode(FLOW_SENSOR_PIN,  INPUT);

  // Flow sensor interrupt (optical drop detector triggers on falling edge)
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseISR, FALLING);

  // Servo setup
  clampServo.attach(SERVO_PIN);
  setServoAngle(state.servo_angle);

  // Network
  connectWiFi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setKeepAlive(60);
  connectMQTT();

  Serial.println("[IVaaRA] Setup complete. Entering main loop.");
}

// ─────────────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── 1. Always: local safety checks ────────────────────────
  runLocalSafetyChecks();

  // ── 2. Always: sensor acquisition ─────────────────────────
  state.flow_rate   = readFlowRate();
  state.temperature = readTemperature();

  // ── 3. Always: automatic flow control (if enabled) ────────
  if (state.mode == AUTO) {
    runAutoControl();
  }

  // ── 4. Network: MQTT keepalive (non-blocking) ─────────────
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) {
      connectMQTT();
    }
    mqtt.loop();
  }

  // ── 5. Periodic: telemetry publish ────────────────────────
  if (now - state.last_telemetry_ms >= TELEMETRY_INTERVAL_MS) {
    state.last_telemetry_ms = now;
    publishTelemetry();

    // Blink status LED
    digitalWrite(LED_STATUS_PIN, !digitalRead(LED_STATUS_PIN));

    Serial.printf("[TELE] flow=%.1f target=%.1f temp=%.1f vol=%.0f servo=%d°\n",
                  state.flow_rate, state.target_flow, state.temperature,
                  state.remaining_volume, state.servo_angle);
  }

  // ── 6. Reconnect WiFi if lost ─────────────────────────────
  static unsigned long lastWiFiCheck = 0;
  if (now - lastWiFiCheck > 30000 && WiFi.status() != WL_CONNECTED) {
    lastWiFiCheck = now;
    WiFi.reconnect();
  }
}
