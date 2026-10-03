// IVaaRA Mobile — Custom hooks

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as api from '../services/api';
import { Config } from '../constants/config';
import type { Device, Alert, AIStatus, SystemStatus } from '../types';

// ── useDevices ────────────────────────────────────────────────
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await api.getDevices();
      setDevices(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, Config.POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetch]);

  return { devices, loading, error, refresh: fetch };
}

// ── useDevice ────────────────────────────────────────────────
export function useDevice(deviceId: string | undefined) {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!deviceId) return;
    try {
      const data = await api.getDevice(deviceId);
      setDevice(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load device');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, Config.POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetch]);

  return { device, loading, error, refresh: fetch };
}

// ── useAlerts ────────────────────────────────────────────────
export function useAlerts(deviceId?: string) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = deviceId
        ? await api.getDeviceAlerts(deviceId)
        : await api.getAllAlerts();
      setAlerts(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, Config.POLL_INTERVAL_MS * 2);
    return () => clearInterval(interval);
  }, [fetch]);

  return { alerts, loading, error, refresh: fetch };
}

// ── useSystemStatus ──────────────────────────────────────────
export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await api.getSystemStatus();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backend unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 10000); // every 10s
    return () => clearInterval(interval);
  }, [fetch]);

  return { status, loading, error, refresh: fetch };
}

// ── useAIStatus ──────────────────────────────────────────────
export function useAIStatus() {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);

  useEffect(() => {
    api.getAIStatus().then(setAiStatus).catch(() =>
      setAiStatus({ status: 'UNAVAILABLE', model: null, ai_available: false })
    );
  }, []);

  return aiStatus;
}

// ── useTimeAgo ───────────────────────────────────────────────
export function useTimeAgo(timestamp: string | null): string {
  const [label, setLabel] = useState('Never');

  useEffect(() => {
    if (!timestamp) { setLabel('Never'); return; }
    const update = () => {
      const secs = Math.round((Date.now() - new Date(timestamp).getTime()) / 1000);
      if (secs < 0) setLabel('Just now');
      else if (secs < 60) setLabel(`${secs}s ago`);
      else if (secs < 3600) setLabel(`${Math.round(secs / 60)}m ago`);
      else setLabel(`${Math.round(secs / 3600)}h ago`);
    };
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, [timestamp]);

  return label;
}
