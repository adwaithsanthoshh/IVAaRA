// IVaaRA – REST API service layer
// All API calls go through here — never hardcoded in components

import type {
  Alert,
  AnalyticsSummary,
  CommandResponse,
  Device,
  RiskAssessment,
  SystemStatus,
  Telemetry,
} from '../types';

const BASE_URL = '/api';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Devices ─────────────────────────────────────────────────

export async function fetchDevices(status?: string): Promise<Device[]> {
  const qs = status ? `?status=${status}` : '';
  return request<Device[]>(`/devices${qs}`);
}

export async function createDevice(data: {
  device_id: string;
  name: string;
  iv_type?: string;
  initial_volume_ml?: number;
}): Promise<Device> {
  return request<Device>('/devices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}


export async function fetchDevice(deviceId: string): Promise<Device> {
  return request<Device>(`/devices/${deviceId}`);
}

export async function fetchDeviceTelemetry(
  deviceId: string,
  limit = 100,
): Promise<Telemetry[]> {
  return request<Telemetry[]>(`/devices/${deviceId}/telemetry?limit=${limit}`);
}

export async function fetchDeviceHistory(
  deviceId: string,
  hours = 24,
): Promise<Telemetry[]> {
  return request<Telemetry[]>(`/devices/${deviceId}/history?hours=${hours}`);
}

export async function fetchDeviceRisk(deviceId: string): Promise<RiskAssessment> {
  return request<RiskAssessment>(`/devices/${deviceId}/risk`);
}

export async function sendEmergencyStop(
  deviceId: string,
  operator?: string,
  reason?: string,
): Promise<CommandResponse> {
  return request<CommandResponse>(`/devices/${deviceId}/emergency-stop`, {
    method: 'POST',
    body: JSON.stringify({ operator, reason }),
  });
}

export async function setControlMode(
  deviceId: string,
  mode: string,
  targetFlow?: number,
  servoAngle?: number,
  operator?: string,
): Promise<CommandResponse> {
  return request<CommandResponse>(`/devices/${deviceId}/control-mode`, {
    method: 'POST',
    body: JSON.stringify({ mode, target_flow: targetFlow, servo_angle: servoAngle, operator }),
  });
}

// ── Alerts ──────────────────────────────────────────────────

export async function fetchAlerts(params?: {
  status?: string;
  severity?: string;
  device_id?: string;
  limit?: number;
}): Promise<Alert[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.severity) qs.set('severity', params.severity);
  if (params?.device_id) qs.set('device_id', params.device_id);
  if (params?.limit) qs.set('limit', String(params.limit));
  return request<Alert[]>(`/alerts?${qs.toString()}`);
}

export async function acknowledgeAlert(
  alertId: string,
  actionTaken?: string,
): Promise<Alert> {
  return request<Alert>(`/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ action_taken: actionTaken }),
  });
}

// ── System ──────────────────────────────────────────────────

export async function fetchSystemStatus(): Promise<SystemStatus> {
  return request<SystemStatus>('/system/status');
}

// ── Analytics ───────────────────────────────────────────────

export async function fetchAnalytics(
  deviceId: string,
  hours = 24,
): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>(
    `/analytics/summary/${deviceId}?hours=${hours}`,
  );
}

// ── Device update ────────────────────────────────────────────

export async function updateDeviceIvType(
  deviceId: string,
  ivType: string,
): Promise<Device> {
  return request<Device>(`/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ iv_type: ivType }),
  });
}

// ── AI ────────────────────────────────────────────────────────

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

export async function getAIStatus(): Promise<AIStatus> {
  return request<AIStatus>('/ai/status');
}

export async function getAIInsight(deviceId: string): Promise<AIInsight> {
  return request<AIInsight>(`/ai/insight/${deviceId}`);
}

export async function analyzeDevice(deviceId: string): Promise<AIInsight> {
  return request<AIInsight>(`/ai/analyze/${deviceId}`, { method: 'POST' });
}

export async function askAI(deviceId: string, question: string): Promise<AIChatResponse> {
  return request<AIChatResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, question }),
  });
}

export async function getSessionSummary(deviceId: string, hours = 4): Promise<{ summary: string; statistics: Record<string, unknown> }> {
  return request(`/ai/session-summary/${deviceId}?hours=${hours}`);
}
