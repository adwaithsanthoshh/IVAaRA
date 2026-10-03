/**
 * IVaaRA – Overview Page
 * Matches the Stitch design photo exactly:
 *  Row 1: IV-Type selector | Alert/Warning | Status | Temperature
 *  Row 2: DROP/min gauge   | (alert feed)  | Emergency Stop | (temp value)
 *  Row 3: Abnormality chart | Risk Score gauge | Temperature history
 *  Row 4: Automatic control switch
 */

import { useEffect, useRef, useState } from 'react';
import {
  fetchAlerts,
  fetchDeviceHistory,
  fetchDeviceRisk,
  fetchDevices,
  sendEmergencyStop,
  setControlMode,
  updateDeviceIvType,
} from '../services/api';
import type { Alert, Device, RiskAssessment, Telemetry, WSMessage } from '../types';
import { AIInsightCard } from '../components/ai/AIInsightCard';
import { AIChat } from '../components/ai/AIChat';

interface OverviewPageProps {
  subscribe: (type: string, handler: (msg: WSMessage) => void) => () => void;
}

// ── Semicircle Gauge ───────────────────────────────────────────
function SemiGauge({
  value,
  min = 0,
  max = 30,
  unit = '',
  label = '',
  size = 160,
}: {
  value: number | null;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  size?: number;
}) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size * 0.58;
  const startAngle = -180;
  const pct = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const sweepAngle = pct * 180;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcStart = toRad(startAngle);
  const arcEnd = toRad(startAngle + sweepAngle);
  const x1 = cx + r * Math.cos(arcStart);
  const y1 = cy + r * Math.sin(arcStart);
  const x2 = cx + r * Math.cos(arcEnd);
  const y2 = cy + r * Math.sin(arcEnd);
  const largeArc = sweepAngle > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={size * 0.07}
          strokeLinecap="round"
        />
        {/* Fill */}
        {value !== null && sweepAngle > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none"
            stroke="#2ec4b6"
            strokeWidth={size * 0.07}
            strokeLinecap="round"
          />
        )}
        {/* Tick marks */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const angle = toRad(-180 + p * 180);
          const inner = r - size * 0.08;
          const outer = r + size * 0.02;
          return (
            <line
              key={p}
              x1={cx + inner * Math.cos(angle)}
              y1={cy + inner * Math.sin(angle)}
              x2={cx + outer * Math.cos(angle)}
              y2={cy + outer * Math.sin(angle)}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          );
        })}
        {/* Value */}
        <text
          x={cx}
          y={cy - size * 0.04}
          textAnchor="middle"
          fontSize={size * 0.15}
          fontWeight="600"
          fill={value === null ? '#94a3b8' : '#1e293b'}
          fontFamily="Inter, sans-serif"
        >
          {value === null ? '—' : value.toFixed(1)}
        </text>
        {unit && (
          <text
            x={cx}
            y={cy + size * 0.08}
            textAnchor="middle"
            fontSize={size * 0.09}
            fill="#64748b"
            fontFamily="Inter, sans-serif"
          >
            {unit}
          </text>
        )}
        {/* Min / Max labels */}
        <text x={cx - r - 4} y={cy + 14} textAnchor="middle" fontSize={size * 0.09} fill="#94a3b8" fontFamily="Inter, sans-serif">{min}</text>
        <text x={cx + r + 4} y={cy + 14} textAnchor="middle" fontSize={size * 0.09} fill="#94a3b8" fontFamily="Inter, sans-serif">{max}</text>
      </svg>
      {label && <p className="text-xs text-[#64748b] mt-1 font-medium uppercase tracking-wider">{label}</p>}
    </div>
  );
}

// ── Mini sparkline chart ───────────────────────────────────────
function Sparkline({
  data,
  width = 400,
  height = 90,
  color = '#2ec4b6',
  showDots = true,
}: {
  data: { t: Date; v: number }[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
}) {
  if (data.length < 2) {
    return (
      <div className="w-full flex items-center justify-center h-full text-[#94a3b8] text-sm">
        No data available
      </div>
    );
  }
  const vals = data.map((d) => d.v);
  const times = data.map((d) => d.t.getTime());
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals, minV + 1);
  const minT = Math.min(...times);
  const maxT = Math.max(...times, minT + 1);
  const pad = { l: 8, r: 8, t: 8, b: 24 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;

  const px = (t: number) => pad.l + ((t - minT) / (maxT - minT)) * W;
  const py = (v: number) => pad.t + (1 - (v - minV) / (maxV - minV)) * H;

  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(d.t.getTime()).toFixed(1)},${py(d.v).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${px(maxT).toFixed(1)},${(pad.t + H).toFixed(1)} L${px(minT).toFixed(1)},${(pad.t + H).toFixed(1)} Z`;

  // X-axis time labels (3 evenly spaced)
  const labelIdxs = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={areaD} fill={`url(#sg-${color.replace('#', '')})`} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {showDots && data.map((d, i) => (
        <circle key={i} cx={px(d.t.getTime())} cy={py(d.v)} r="3" fill={color} />
      ))}
      {/* X labels */}
      {labelIdxs.map((idx) => (
        <text
          key={idx}
          x={px(data[idx].t.getTime())}
          y={height - 4}
          textAnchor="middle"
          fontSize="9"
          fill="#94a3b8"
          fontFamily="Inter, sans-serif"
        >
          {data[idx].t.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </text>
      ))}
    </svg>
  );
}

// ── Status panel ───────────────────────────────────────────────
function StatusPanel({ status }: { status: string }) {
  const isOnline = status === 'ONLINE';
  const isError = status === 'ERROR';
  const bg = isOnline ? '#22c55e' : isError ? '#ef4444' : '#ef4444';
  const icon = isOnline ? '✓' : '✕';
  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full rounded"
      style={{ backgroundColor: bg, minHeight: 80 }}
    >
      <span style={{ fontSize: 48, color: 'white', fontWeight: 700, lineHeight: 1 }}>{icon}</span>
    </div>
  );
}

// ── Emergency Stop Button ─────────────────────────────────────
function EStopButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <button
        onClick={onClick}
        disabled={loading}
        className="rounded-full border-4 border-[#cbd5e1] bg-[#f1f5f9] flex items-center justify-center transition-all hover:border-red-400 hover:bg-red-50 active:scale-95 disabled:opacity-50"
        style={{ width: 100, height: 100 }}
        title="Emergency Stop — halts IV pump immediately"
        aria-label="Emergency Stop"
      >
        {loading ? (
          <span className="text-[#94a3b8] text-xs">...</span>
        ) : null}
      </button>
      <p className="text-xs text-[#64748b] mt-2 uppercase tracking-wider font-semibold">EMERGENCY STOP</p>
    </div>
  );
}

// ── Alert Feed (chat style) ────────────────────────────────────
interface AlertItem {
  id: string;
  message: string;
  severity: string;
  timestamp: string;
}

function AlertFeed({ alerts }: { alerts: AlertItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [alerts.length]);

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 px-2 py-2 min-h-0" style={{ maxHeight: 130 }}>
        {alerts.length === 0 ? (
          <p className="text-[#94a3b8] text-sm text-center pt-4">No alerts</p>
        ) : (
          alerts.slice(-20).map((a) => (
            <div key={a.id} className="flex items-start gap-2">
              <div
                className={`flex-shrink-0 w-2 h-2 mt-1 rounded-full ${
                  a.severity === 'CRITICAL' ? 'bg-red-500' : a.severity === 'WARNING' ? 'bg-amber-500' : 'bg-blue-400'
                }`}
              />
              <div>
                <p className="text-xs text-[#334155] leading-snug">{a.message}</p>
                <p className="text-[10px] text-[#94a3b8]">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      {/* Message input (display only — alerts are system-generated) */}
      <div className="flex items-center gap-2 border-t border-[#e2e8f0] px-2 py-1.5 mt-1">
        <input
          readOnly
          placeholder="Type a message"
          className="flex-1 text-sm bg-transparent outline-none text-[#94a3b8] placeholder-[#94a3b8] cursor-not-allowed"
        />
        <button className="w-7 h-7 rounded-full bg-[#2ec4b6] flex items-center justify-center opacity-50" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M2 12l19-9-4 9 4 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Time range selector ────────────────────────────────────────
const TIME_RANGES = ['15D', '7D', '1D', '1H', 'LIVE'] as const;
type TimeRange = (typeof TIME_RANGES)[number];
function rangeToHours(r: TimeRange): number {
  return r === 'LIVE' ? 1 : r === '1H' ? 1 : r === '1D' ? 24 : r === '7D' ? 168 : 360;
}

// ── Main page ──────────────────────────────────────────────────
export function OverviewPage({ subscribe }: OverviewPageProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState('IV-001');
  const [device, setDevice] = useState<Device | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [flowHistory, setFlowHistory] = useState<{ t: Date; v: number }[]>([]);
  const [tempHistory, setTempHistory] = useState<{ t: Date; v: number }[]>([]);
  const [flowRange, setFlowRange] = useState<TimeRange>('LIVE');
  const [tempRange, setTempRange] = useState<TimeRange>('LIVE');
  const [autoControl, setAutoControl] = useState<boolean | null>(null); // null = unknown until telemetry arrives
  const [eStopLoading, setEStopLoading] = useState(false);
  const [eStopConfirm, setEStopConfirm] = useState(false);
  const [switchLoading, setSwitchLoading] = useState(false);
  const [aiRefreshKey, setAiRefreshKey] = useState(0);

  // ── Load devices list
  useEffect(() => {
    fetchDevices()
      .then((devs: Device[]) => {
        setDevices(devs);
        const focused = sessionStorage.getItem('ivara_focus_device');
        const id = focused ?? (devs[0]?.device_id || 'IV-001');
        sessionStorage.removeItem('ivara_focus_device');
        setSelectedId(id);
        const found = devs.find((d) => d.device_id === id);
        if (found) {
          setDevice(found);
          // Init autoControl from latest telemetry if available
          const latestAutoCtrl = found.latest_telemetry?.automatic_control;
          if (latestAutoCtrl !== null && latestAutoCtrl !== undefined) {
            setAutoControl(latestAutoCtrl);
          }
        }
      })
      .catch(console.error);
  }, []);

  // ── Load risk when device changes
  useEffect(() => {
    if (!selectedId) return;
    fetchDeviceRisk(selectedId)
      .then((r) => setRisk(r as RiskAssessment))
      .catch(() => setRisk(null));
  }, [selectedId]);

  // ── Load existing alerts from DB on mount / device change
  useEffect(() => {
    if (!selectedId) return;
    fetchAlerts({ device_id: selectedId, limit: 50 })
      .then((rows: Alert[]) => {
        const mapped = rows.map((a) => ({
          id: a.id,
          message: a.message,
          severity: a.severity,
          timestamp: typeof a.timestamp === 'string' ? a.timestamp : new Date(a.timestamp).toISOString(),
        }));
        setAlerts(mapped);
      })
      .catch(() => setAlerts([]));
  }, [selectedId]);

  // ── Load flow history
  useEffect(() => {
    if (!selectedId) return;
    const hours = rangeToHours(flowRange);
    fetchDeviceHistory(selectedId, hours)
      .then((rows: Telemetry[]) => {
        const pts = rows
          .filter((r) => r.flow_rate !== null && r.flow_rate !== undefined)
          .map((r) => ({ t: new Date(r.timestamp), v: r.flow_rate! }));
        setFlowHistory(pts);
      })
      .catch(() => setFlowHistory([]));
  }, [selectedId, flowRange]);

  // ── Load temp history
  useEffect(() => {
    if (!selectedId) return;
    const hours = rangeToHours(tempRange);
    fetchDeviceHistory(selectedId, hours)
      .then((rows: Telemetry[]) => {
        const pts = rows
          .filter((r) => r.temperature !== null && r.temperature !== undefined)
          .map((r) => ({ t: new Date(r.timestamp), v: r.temperature! }));
        setTempHistory(pts);
      })
      .catch(() => setTempHistory([]));
  }, [selectedId, tempRange]);

  // ── WebSocket: live telemetry
  useEffect(() => {
    const unsubTel = subscribe('telemetry', (msg: WSMessage) => {
      if (msg.device_id !== selectedId) return;
      const d = msg.data as Record<string, unknown>;
      setTelemetry((prev) => ({ ...(prev ?? {}), ...d } as Telemetry));
      // Sync autoControl from live telemetry
      if (d.automatic_control !== undefined && d.automatic_control !== null) {
        setAutoControl(d.automatic_control as boolean);
      }
      if (d.flow_rate !== undefined && d.flow_rate !== null) {
        setFlowHistory((h) => {
          const pt = { t: new Date(d.timestamp as string || Date.now()), v: d.flow_rate as number };
          const next = [...h, pt].slice(-120); // rolling 120-point window
          return next;
        });
      }
      if (d.temperature !== undefined && d.temperature !== null) {
        setTempHistory((h) => {
          const pt = { t: new Date(d.timestamp as string || Date.now()), v: d.temperature as number };
          return [...h, pt].slice(-120);
        });
      }
    });

    const unsubRisk = subscribe('risk', (msg: WSMessage) => {
      if (msg.device_id !== selectedId) return;
      setRisk((prev) => ({ ...(prev ?? {}), ...msg.data } as RiskAssessment));
    });

    const unsubStatus = subscribe('device_status', (msg: WSMessage) => {
      if (msg.device_id !== selectedId) return;
      const d = msg.data as { status: string };
      setDevice((prev) => prev ? { ...prev, status: d.status as Device['status'] } : prev);
    });

    const unsubAlert = subscribe('alert', (msg: WSMessage) => {
      if (msg.data && (msg.device_id === selectedId || !msg.device_id)) {
        const a = msg.data as unknown as AlertItem;
        setAlerts((prev) => [a, ...prev].slice(0, 50));
      }
    });

    return () => { unsubTel(); unsubRisk(); unsubStatus(); unsubAlert(); };
  }, [subscribe, selectedId]);

  // ── Auto-control toggle
  const handleSwitchToggle = async () => {
    setSwitchLoading(true);
    const nextMode = autoControl ? 'MANUAL' : 'AUTOMATIC';
    try {
      await setControlMode(selectedId, nextMode);
      setAutoControl((v) => !v);
    } catch (e) {
      console.error(e);
    } finally {
      setSwitchLoading(false);
    }
  };

  // ── Emergency stop
  const handleEStop = async () => {
    if (!eStopConfirm) { setEStopConfirm(true); return; }
    setEStopLoading(true);
    setEStopConfirm(false);
    try {
      await sendEmergencyStop(selectedId, 'Operator via dashboard');
    } catch (e) {
      console.error(e);
    } finally {
      setEStopLoading(false);
    }
  };

  const currentFlow = telemetry?.flow_rate ?? null;
  const currentTemp = telemetry?.temperature ?? null;
  const deviceStatus = device?.status ?? 'OFFLINE';
  const ivType = device?.iv_type ?? 'Normal Saline 0.9%';
  const autoControlOn = autoControl ?? true; // default ON if not yet known

  const riskScore = (risk?.risk_score ?? 0) as number;
  const riskLevel = (risk?.risk_level ?? 'UNKNOWN') as string;
  const riskColor = riskLevel === 'LOW' ? '#22c55e' : riskLevel === 'MODERATE' ? '#f59e0b' : riskLevel === 'HIGH' ? '#ef4444' : riskLevel === 'CRITICAL' ? '#7c3aed' : '#94a3b8';

  return (
    <div className="w-full min-h-screen bg-[#f9f9ff] p-0">
      {/* ── Device selector ─────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-[#e2e8f0] bg-white">
        <span className="text-xs font-semibold text-[#64748b] uppercase tracking-widest">Device</span>
        {devices.map((d) => (
          <button
            key={d.device_id}
            onClick={() => {
              setSelectedId(d.device_id);
              setDevice(d);
              setTelemetry(null);
              setAiRefreshKey((k) => k + 1);
            }}
            className={`px-3 py-1 text-sm font-medium rounded border transition-colors ${
              d.device_id === selectedId
                ? 'bg-[#2ec4b6] text-white border-[#2ec4b6]'
                : 'text-[#334155] border-[#e2e8f0] hover:border-[#2ec4b6]'
            }`}
          >
            {d.device_id}
          </button>
        ))}
        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded ${deviceStatus === 'ONLINE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {deviceStatus}
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MAIN GRID — matches Stitch photo exactly
          ══════════════════════════════════════════════════════════ */}
      <div className="grid gap-3 p-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>

        {/* ── Cell 1: IV Type selector ────────────────────────── */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Value Dropdown</span>
            <span className="text-[10px] text-[#2ec4b6] font-semibold">Example</span>
          </div>
          <select
            value={ivType}
            onChange={async (e) => {
              const newType = e.target.value;
              setDevice((prev) => prev ? { ...prev, iv_type: newType } : prev);
              try {
                await updateDeviceIvType(selectedId, newType);
              } catch {
                // Revert on failure
                setDevice((prev) => prev ? { ...prev, iv_type: ivType } : prev);
              }
            }}
            className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm text-[#334155] focus:outline-none focus:border-[#2ec4b6] bg-white cursor-pointer"
          >
            <option>Normal Saline 0.9%</option>
            <option>Ringer's Lactate</option>
            <option>Dextrose 5%</option>
            <option>Glucose IV</option>
          </select>
          {/* DROP/min gauge below selector */}
          <div className="mt-2">
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-1">DROP/min</p>
            <SemiGauge value={currentFlow} min={0} max={30} unit="drops/min" size={150} />
          </div>
        </div>

        {/* ── Cell 2: Alert / Warning feed ─────────────────────── */}
        <div className="bg-white border border-[#e2e8f0] rounded flex flex-col" style={{ minHeight: 260 }}>
          <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-[#e2e8f0]">
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">ALERT/WARNING</span>
            <span className="text-[10px] text-[#2ec4b6] font-semibold">Example</span>
          </div>
          {/* Date badge */}
          <div className="px-3 pt-1">
            <span className="inline-block text-[10px] bg-[#334155] text-white rounded-full px-2 py-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' })}
            </span>
          </div>
          <div className="flex-1 px-1 pb-1">
            <AlertFeed alerts={alerts} />
          </div>
        </div>

        {/* ── Cell 3: Status + Emergency Stop ──────────────────── */}
        <div className="bg-white border border-[#e2e8f0] rounded flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Status</span>
            <span className="text-[10px] text-[#2ec4b6] font-semibold">Example</span>
          </div>
          <StatusPanel status={deviceStatus} />
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mt-1">EMERGENCY STOP</p>
          <EStopButton onClick={handleEStop} loading={eStopLoading} />
          {eStopConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg p-6 shadow-xl max-w-xs w-full">
                <h3 className="text-lg font-bold text-red-600 mb-2">⚠ Emergency Stop</h3>
                <p className="text-sm text-[#334155] mb-4">This will send an EMERGENCY STOP command to <strong>{selectedId}</strong>. The ESP32 will close the IV clamp immediately. Confirm?</p>
                <div className="flex gap-2">
                  <button onClick={handleEStop} className="flex-1 bg-red-600 text-white rounded px-3 py-2 text-sm font-bold hover:bg-red-700">
                    {eStopLoading ? 'Sending…' : 'STOP NOW'}
                  </button>
                  <button onClick={() => setEStopConfirm(false)} className="flex-1 border border-[#e2e8f0] text-[#334155] rounded px-3 py-2 text-sm hover:bg-[#f1f5f9]">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Cell 4: Temperature ───────────────────────────────── */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">TEMPERATURE</span>
            <span className="text-[10px] text-[#2ec4b6] font-semibold">Example</span>
          </div>
          {/* Thermometer icon */}
          <div className="flex flex-col items-center py-2">
            <svg width="44" height="60" viewBox="0 0 44 70">
              <rect x="18" y="6" width="8" height="38" rx="4" fill="#f87171" opacity="0.3" />
              <rect x="19" y={6 + (1 - Math.min(1, Math.max(0, ((currentTemp ?? 36) - 30) / 25))) * 34} width="6" height={Math.min(38, Math.max(4, ((currentTemp ?? 36) - 30) / 25 * 34 + 4))} rx="3" fill="#ef4444" />
              <circle cx="22" cy="56" r="10" fill="#ef4444" />
              <circle cx="22" cy="56" r="6" fill="#fca5a5" />
              {[0, 8, 16, 24, 32].map((y) => (
                <line key={y} x1="28" y1={10 + y} x2={y % 16 === 0 ? 34 : 32} y2={10 + y} stroke="#ef4444" strokeWidth="1.5" />
              ))}
            </svg>
            <div className="border border-[#e2e8f0] rounded px-4 py-2 text-center mt-1">
              <span className="text-2xl font-bold text-[#1e293b] tabular-nums">
                {currentTemp !== null ? currentTemp.toFixed(3) : '—'}
              </span>
              <span className="text-sm text-[#64748b] ml-1">°C</span>
            </div>
            {currentTemp !== null && (currentTemp < 35 || currentTemp > 46) && (
              <span className="text-xs text-red-500 font-semibold mt-1">⚠ Abnormal</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Second row: Abnormality chart | Risk Score | Temp History ── */}
      <div className="grid gap-3 px-3 pb-3" style={{ gridTemplateColumns: '2fr 1fr 2fr' }}>

        {/* Abnormality / Flow chart */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">ABNORMALITY</span>
            <div className="flex items-center gap-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setFlowRange(r)}
                  className={`text-[10px] px-2 py-0.5 rounded-sm font-semibold transition-colors ${
                    flowRange === r ? 'bg-[#2ec4b6] text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 120 }}>
            <Sparkline data={flowHistory} color="#2ec4b6" showDots width={420} height={120} />
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-1">UTC+00:00 — Flow Rate (drops/min)</p>
        </div>

        {/* Risk Score gauge */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 flex flex-col items-center">
          <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest self-start mb-2">RISK SCORE</span>
          <SemiGauge value={riskScore} min={0} max={100} size={150} />
          <div className="mt-1 text-center">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: riskColor + '22', color: riskColor }}
            >
              {riskLevel}
            </span>
          </div>
          {risk?.contributing_factors && (
            <p className="text-[10px] text-[#94a3b8] text-center mt-1 leading-tight px-2">
              {(() => {
                try {
                  const f = JSON.parse(risk.contributing_factors as string);
                  return Array.isArray(f) ? f.slice(0, 2).join(', ') : '';
                } catch { return ''; }
              })()}
            </p>
          )}
        </div>

        {/* Temperature history chart */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">TEMPERATURE HISTORY</span>
            <div className="flex items-center gap-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setTempRange(r)}
                  className={`text-[10px] px-2 py-0.5 rounded-sm font-semibold transition-colors ${
                    tempRange === r ? 'bg-[#2ec4b6] text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 120 }}>
            <Sparkline data={tempHistory} color="#f87171" showDots={false} width={420} height={120} />
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-1">UTC+00:00 — Temperature (°C)</p>
        </div>
      </div>

      {/* ── Switch / Automatic control ──────────────────────────── */}
      <div className="px-3 pb-4 flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Switch</span>
        <button
          onClick={handleSwitchToggle}
          disabled={switchLoading}
          className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
            autoControlOn ? 'bg-[#2ec4b6]' : 'bg-[#e2e8f0]'
          }`}
          aria-label="Toggle automatic control"
        >
          <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${autoControlOn ? 'translate-x-9' : 'translate-x-1'}`} />
          <span className={`absolute text-[10px] font-bold ${autoControlOn ? 'left-2 text-white' : 'right-2 text-[#94a3b8]'}`}>
            {autoControlOn ? 'ON' : 'OFF'}
          </span>
        </button>
        <p className="text-[10px] text-[#94a3b8]">Automatic IV flow control</p>
      </div>

      {/* ── AI Section ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mt-4 px-3 pb-4">
        <AIInsightCard deviceId={selectedId} refreshKey={aiRefreshKey} />
        <AIChat deviceId={selectedId} />
      </div>
    </div>
  );
}
