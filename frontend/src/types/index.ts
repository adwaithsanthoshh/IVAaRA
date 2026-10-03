// IVaaRA – TypeScript type definitions matching backend schemas

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'ERROR';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type ControlMode = 'AUTOMATIC' | 'MANUAL' | 'EMERGENCY_STOP';

export interface Telemetry {
  id: string;
  device_id: string;
  timestamp: string;
  flow_rate: number | null;
  target_flow: number | null;
  temperature: number | null;
  remaining_volume_ml: number | null;
  servo_angle: number | null;
  automatic_control: boolean | null;
  sensor_status: 'OK' | 'ERROR' | 'DEGRADED' | null;
}

export interface Device {
  id: string;
  device_id: string;
  name: string;
  bed_id: string | null;
  status: DeviceStatus;
  firmware_version: string | null;
  last_seen: string | null;
  mqtt_topic_prefix: string;
  iv_type: string | null;
  initial_volume_ml: number | null;
  created_at: string;
  updated_at: string;
  latest_telemetry: Telemetry | null;
  latest_risk_level: RiskLevel | null;
  latest_risk_score: number | null;
}

export interface Alert {
  id: string;
  device_id: string;
  alert_type: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  status: AlertStatus;
  acknowledged_at: string | null;
  resolved_at: string | null;
  action_taken: string | null;
}

export interface RiskAssessment {
  id: string;
  device_id: string;
  timestamp: string;
  risk_score: number;
  risk_level: RiskLevel;
  contributing_factors: string | null;  // JSON string
  llm_summary: string | null;
}

export interface SystemStatus {
  backend_status: string;
  mqtt_connected: boolean;
  mqtt_latency_ms: number | null;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  active_alerts: number;
  critical_alerts: number;
  timestamp: string;
}

export interface AnalyticsSummary {
  device_id: string;
  period_hours: number;
  avg_flow: number | null;
  min_flow: number | null;
  max_flow: number | null;
  avg_temperature: number | null;
  alert_count: number;
  uptime_percent: number | null;
}

export interface CommandResponse {
  event_id: string;
  device_id: string;
  command: string;
  status: string;
  timestamp: string;
}

// WebSocket message types
export type WSMessageType =
  | 'connected'
  | 'telemetry'
  | 'alert'
  | 'alert_update'
  | 'risk'
  | 'device_status'
  | 'device_ack'
  | 'emergency_stop'
  | 'heartbeat'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  device_id?: string;
  data: Record<string, unknown>;
  timestamp: string;
}
