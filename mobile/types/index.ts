// IVaaRA Mobile — TypeScript types matching backend schemas exactly

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'ERROR';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

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
  contributing_factors: string | null;
  llm_summary: string | null;
}

export interface SystemStatus {
  backend_status: string;
  mqtt_connected: boolean;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  active_alerts: number;
  critical_alerts: number;
  timestamp: string;
}

export interface AIInsight {
  risk_level: string;
  trend: string;
  anomaly: boolean;
  confidence: number;
  reason: string;
  recommendation: string;
  alert_required: boolean;
  summary: string;
  ai_available: boolean;
  model_used?: string;
}

export interface AIStatus {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'CONFIGURATION_REQUIRED';
  model: string | null;
  ai_available: boolean;
  key_count: number;
}

export interface AIChatResponse {
  answer: string;
  device_id: string;
  timestamp: string;
  ai_available: boolean;
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

export interface HistoryPoint {
  timestamp: string;
  flow_rate: number | null;
  temperature: number | null;
}
