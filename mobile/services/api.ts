// IVaaRA Mobile — Central API service
// All HTTP calls go through here. NEVER call Groq directly from mobile.

import { Config } from '../constants/config';
import type {
  AIInsight,
  AIStatus,
  AIChatResponse,
  Alert,
  AnalyticsSummary,
  Device,
  SystemStatus,
  Telemetry,
} from '../types';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${Config.API_BASE_URL}/api${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, `HTTP ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. Check backend connectivity.');
    }
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Devices ──────────────────────────────────────────────────
export async function getDevices(): Promise<Device[]> {
  return request<Device[]>('/devices');
}

export async function getDevice(deviceId: string): Promise<Device> {
  return request<Device>(`/devices/${deviceId}`);
}

// ── Telemetry ────────────────────────────────────────────────
export async function getDeviceTelemetry(deviceId: string, limit = 20): Promise<Telemetry[]> {
  return request<Telemetry[]>(`/devices/${deviceId}/telemetry?limit=${limit}`);
}

// ── Alerts ───────────────────────────────────────────────────
export async function getDeviceAlerts(deviceId: string, limit = 30): Promise<Alert[]> {
  return request<Alert[]>(`/alerts?device_id=${deviceId}&limit=${limit}`);
}

export async function getAllAlerts(status?: string, limit = 50): Promise<Alert[]> {
  const qs = status ? `?status=${status}&limit=${limit}` : `?limit=${limit}`;
  return request<Alert[]>(`/alerts${qs}`);
}

// ── System ───────────────────────────────────────────────────
export async function getSystemStatus(): Promise<SystemStatus> {
  return request<SystemStatus>('/system/status');
}

// ── Analytics / History ──────────────────────────────────────
export async function getAnalytics(deviceId: string, hours = 4): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>(`/analytics/summary/${deviceId}?hours=${hours}`);
}

export async function getDeviceHistory(deviceId: string, hours = 1): Promise<Telemetry[]> {
  return request<Telemetry[]>(`/devices/${deviceId}/telemetry?limit=200&hours=${hours}`);
}

// ── Risk ─────────────────────────────────────────────────────
export async function getDeviceRisk(deviceId: string) {
  return request(`/devices/${deviceId}/risk`);
}

// ── Emergency Stop ───────────────────────────────────────────
export async function sendEmergencyStop(deviceId: string) {
  return request(`/devices/${deviceId}/emergency-stop`, { method: 'POST' });
}

// ── AI ───────────────────────────────────────────────────────
export async function getAIStatus(): Promise<AIStatus> {
  return request<AIStatus>('/ai/status');
}

export async function getAIInsight(deviceId: string): Promise<AIInsight> {
  return request<AIInsight>(`/ai/insight/${deviceId}`);
}

export async function askAI(deviceId: string, question: string): Promise<AIChatResponse> {
  return request<AIChatResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, question }),
  });
}
