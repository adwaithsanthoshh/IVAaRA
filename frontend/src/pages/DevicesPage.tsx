// IVaaRA – IV Devices Fleet Page
// With working Add New Device modal

import { useEffect, useState } from 'react';
import { createDevice, fetchDevices, fetchSystemStatus } from '../services/api';
import type { Device, SystemStatus, WSMessage } from '../types';
import {
  DeviceStatusBadge,
  EmptyState,
  RiskBadge,
  SectionHeader,
  Spinner,
} from '../ui';

interface DevicesPageProps {
  subscribe: (type: string, handler: (msg: WSMessage) => void) => () => void;
  onNavigateToDevice?: (deviceId: string) => void;
}

// ── Add Device Modal ──────────────────────────────────────────
function AddDeviceModal({ onClose, onAdded }: { onClose: () => void; onAdded: (d: Device) => void }) {
  const [form, setForm] = useState({
    device_id: '',
    name: '',
    iv_type: 'Normal Saline 0.9%',
    initial_volume_ml: '500',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.device_id.trim() || !form.name.trim()) {
      setError('Device ID and Name are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const created = await createDevice({
        device_id: form.device_id.trim().toUpperCase(),
        name: form.name.trim(),
        iv_type: form.iv_type || undefined,
        initial_volume_ml: form.initial_volume_ml ? parseFloat(form.initial_volume_ml) : undefined,
      });
      onAdded(created);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('409') ? 'Device ID already exists.' : `Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 border border-[#e2e8f0]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#161c27]">Register New IV Device</h2>
          <button onClick={onClose} className="text-[#707881] hover:text-[#161c27] text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-label-sm text-[#707881] uppercase font-semibold block mb-1">Device ID *</label>
            <input
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm text-[#161c27] focus:outline-none focus:border-[#006194]"
              placeholder="e.g. IV-002"
              value={form.device_id}
              onChange={(e) => setForm((f) => ({ ...f, device_id: e.target.value }))}
              maxLength={32}
            />
            <p className="text-[10px] text-[#94a3b8] mt-0.5">Must match the ESP32 MQTT topic ID</p>
          </div>
          <div>
            <label className="text-label-sm text-[#707881] uppercase font-semibold block mb-1">Display Name *</label>
            <input
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm text-[#161c27] focus:outline-none focus:border-[#006194]"
              placeholder="e.g. IV Monitor — Bed 102"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={64}
            />
          </div>
          <div>
            <label className="text-label-sm text-[#707881] uppercase font-semibold block mb-1">IV Fluid Type</label>
            <select
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm text-[#161c27] bg-white focus:outline-none focus:border-[#006194]"
              value={form.iv_type}
              onChange={(e) => setForm((f) => ({ ...f, iv_type: e.target.value }))}
            >
              <option>Normal Saline 0.9%</option>
              <option>Ringer's Lactate</option>
              <option>Dextrose 5%</option>
              <option>Glucose IV</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="text-label-sm text-[#707881] uppercase font-semibold block mb-1">Initial Volume (mL)</label>
            <input
              type="number"
              min="0"
              max="5000"
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm text-[#161c27] focus:outline-none focus:border-[#006194]"
              value={form.initial_volume_ml}
              onChange={(e) => setForm((f) => ({ ...f, initial_volume_ml: e.target.value }))}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#006194] text-white rounded px-4 py-2 text-sm font-semibold hover:bg-[#004b73] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Registering…' : 'Register Device'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#e2e8f0] text-[#334155] rounded px-4 py-2 text-sm hover:bg-[#f1f5f9]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export function DevicesPage({ subscribe, onNavigateToDevice }: DevicesPageProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Initial load
  useEffect(() => {
    Promise.all([fetchDevices(), fetchSystemStatus()])
      .then(([devs, status]) => {
        setDevices(devs);
        setSystemStatus(status);
        setLoading(false);
      })
      .catch((e) => { console.error(e); setLoading(false); });
  }, []);

  // Live updates
  useEffect(() => {
    const unsubTel = subscribe('telemetry', (msg: WSMessage) => {
      setDevices((prev) =>
        prev.map((d) =>
          d.device_id === msg.device_id
            ? {
                ...d,
                last_seen: msg.timestamp,
                status: 'ONLINE',
                latest_telemetry: { ...(d.latest_telemetry ?? {}), ...(msg.data as object) } as Device['latest_telemetry'],
              }
            : d
        )
      );
    });

    const unsubStatus = subscribe('device_status', (msg: WSMessage) => {
      const newStatus = (msg.data as { status: Device['status'] }).status;
      setDevices((prev) =>
        prev.map((d) => (d.device_id === msg.device_id ? { ...d, status: newStatus } : d))
      );
    });

    const unsubRisk = subscribe('risk', (msg: WSMessage) => {
      const d = msg.data as { risk_level: Device['latest_risk_level']; risk_score: number };
      setDevices((prev) =>
        prev.map((dev) =>
          dev.device_id === msg.device_id
            ? { ...dev, latest_risk_level: d.risk_level, latest_risk_score: d.risk_score }
            : dev
        )
      );
    });

    return () => { unsubTel(); unsubStatus(); unsubRisk(); };
  }, [subscribe]);

  const filtered = devices.filter(
    (d) =>
      d.device_id.toLowerCase().includes(search.toLowerCase()) ||
      (d.iv_type ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (d.bed_id ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const online = devices.filter((d) => d.status === 'ONLINE').length;
  const warnings = devices.filter((d) => d.latest_risk_level === 'MODERATE' || d.latest_risk_level === 'HIGH').length;
  const criticals = devices.filter((d) => d.latest_risk_level === 'CRITICAL').length;

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col w-full">
      {showAddModal && (
        <AddDeviceModal
          onClose={() => setShowAddModal(false)}
          onAdded={(newDevice) => setDevices((prev) => [...prev, newDevice])}
        />
      )}

      {/* Header with actions */}
      <SectionHeader
        title="Connected IV Devices"
        subtitle="Real-time telemetry and hardware status across all monitored hospital beds"
        breadcrumb={['Workstation', 'IV Devices']}
        actions={
          <>
            <div className="relative">
              <input
                type="text"
                placeholder="Search device, bed, fluid..."
                className="bg-white text-[#161c27] text-body-sm pl-8 pr-3 py-2 border border-[#e2e8f0] shadow-card focus:outline-none w-56 placeholder:text-[#707881]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="device-search"
              />
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-[#707881] text-[16px]">search</span>
            </div>
            <button
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#006194] text-white text-label-md rounded shadow-card hover:bg-[#004b73] transition-colors"
              type="button"
              onClick={() => setShowAddModal(true)}
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>Add New Device</span>
            </button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-2 bg-white p-2 rounded shadow-card border border-[#e2e8f0] mb-6">
        {[
          {
            icon: <span className="material-symbols-outlined text-[#006194] text-[22px]">developer_board</span>,
            label: 'Total Connected',
            value: `${devices.length}`,
            unit: 'Units',
            color: 'text-[#161c27]',
          },
          {
            icon: <span className="w-3 h-3 rounded-full bg-[#00855d] flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-white" /></span>,
            label: 'Online',
            value: `${online.toString().padStart(2, '0')}`,
            unit: 'Devices',
            color: 'text-[#006948]',
          },
          {
            icon: <span className="material-symbols-outlined text-[#006781] text-[22px]">warning</span>,
            label: 'Deviations / Warn',
            value: `${warnings.toString().padStart(2, '0')}`,
            unit: 'Devices',
            color: 'text-[#006781]',
          },
          {
            icon: <span className="material-symbols-outlined text-[#ba1a1a] text-[22px] animate-pulse">crisis_alert</span>,
            label: 'Critical',
            value: `${criticals.toString().padStart(2, '0')}`,
            unit: 'Devices',
            color: 'text-[#ba1a1a]',
          },
          {
            icon: null,
            label: 'System Status',
            value: systemStatus?.mqtt_connected ? 'MQTT OK' : 'MQTT OFF',
            unit: '',
            color: systemStatus?.mqtt_connected ? 'text-[#006948]' : 'text-[#ba1a1a]',
          },
        ].map(({ icon, label, value, unit, color }, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1 bg-[#f1f3ff] rounded">
            {icon}
            <div className="flex flex-col">
              <span className="text-label-sm text-[#707881] uppercase font-semibold">{label}</span>
              <span className={`text-telemetry-md tabular-nums ${color}`}>
                {value} <span className="text-body-sm font-normal text-[#707881]">{unit}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Device table */}
      {filtered.length === 0 ? (
        <EmptyState icon="vaccines" title="No devices found" subtitle="No IV devices match your search criteria." />
      ) : (
        <div className="bg-white border border-[#e2e8f0] shadow-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f1f3ff] border-b border-[#e2e8f0]">
                {['Device ID', 'IV Type', 'Bed', 'Flow (drops/min)', 'Temp (°C)', 'Volume (mL)', 'Risk', 'Status', 'Last Update'].map((col) => (
                  <th key={col} className="text-left px-4 py-2.5 text-label-sm text-[#707881] uppercase font-semibold tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((device, i) => {
                const tel = device.latest_telemetry;
                const lastSeen = device.last_seen ? new Date(device.last_seen) : null;
                const secsAgo = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 1000) : null;
                const lastSeenStr =
                  secsAgo === null ? 'Never'
                  : secsAgo < 60 ? `${secsAgo}s ago`
                  : secsAgo < 3600 ? `${Math.round(secsAgo / 60)}m ago`
                  : lastSeen!.toLocaleTimeString();

                return (
                  <tr
                    key={device.device_id}
                    className={`border-b border-[#f1f3ff] hover:bg-[#f9f9ff] cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-[#f9f9ff]'}`}
                    onClick={() => onNavigateToDevice?.(device.device_id)}
                    title={`Open monitoring dashboard for ${device.device_id}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-code font-bold text-[#006194]">{device.device_id}</span>
                    </td>
                    <td className="px-4 py-3 text-body-sm text-[#161c27]">{device.iv_type ?? '—'}</td>
                    <td className="px-4 py-3 text-body-sm text-[#3f4850]">{device.bed_id ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-telemetry-md tabular-nums text-[#161c27]">
                        {tel?.flow_rate?.toFixed(1) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-telemetry-md tabular-nums text-[#161c27]">
                        {tel?.temperature?.toFixed(1) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-body-sm text-[#161c27]">
                        {tel?.remaining_volume_ml?.toFixed(0) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {device.latest_risk_level && device.latest_risk_score !== null ? (
                        <RiskBadge level={device.latest_risk_level} score={device.latest_risk_score} />
                      ) : (
                        <span className="text-body-sm text-[#707881]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DeviceStatusBadge status={device.status} />
                    </td>
                    <td className="px-4 py-3 text-body-sm text-[#707881]">{lastSeenStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
