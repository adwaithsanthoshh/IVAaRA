// IVaaRA – Infusion Analytics & Quality Metrics Page
// Ported from Stitch screen: "Infusion Analytics & Quality Metrics"

import { useEffect, useState } from 'react';
import { fetchAnalytics, fetchDeviceHistory, fetchDevices } from '../services/api';
import type { AnalyticsSummary, Device, Telemetry } from '../types';
import { EmptyState, SectionHeader, Spinner } from '../ui';

export function AnalyticsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState('IV-001');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDevices().then(setDevices).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAnalytics(selectedId, hours).catch(() => null),
      fetchDeviceHistory(selectedId, hours).catch(() => []),
    ]).then(([s, h]) => {
      if (s) setSummary(s);
      setHistory(Array.isArray(h) ? h : []);
      setLoading(false);
    });
  }, [selectedId, hours]);

  // Build SVG chart from telemetry
  const flowValues = history.map((t) => t.flow_rate ?? 0);
  const tempValues = history.map((t) => t.temperature ?? 0);

  function buildPath(values: number[], h: number, w: number): string {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col w-full">
      <SectionHeader
        title="Infusion Analytics & Quality Metrics"
        subtitle="Historical trend analysis and device performance metrics"
        breadcrumb={['Workstation', 'Analytics']}
        actions={
          <div className="flex items-center gap-2">
            <select
              className="bg-white text-[#161c27] text-body-sm px-3 py-1.5 border border-[#e2e8f0] focus:outline-none shadow-card"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>{d.device_id}</option>
              ))}
            </select>
            <select
              className="bg-white text-[#161c27] text-body-sm px-3 py-1.5 border border-[#e2e8f0] focus:outline-none shadow-card"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={1}>Last 1 hour</option>
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={72}>Last 3 days</option>
            </select>
          </div>
        }
      />

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Avg Flow Rate', value: summary.avg_flow?.toFixed(1) ?? '—', unit: 'drops/min' },
            { label: 'Min Flow', value: summary.min_flow?.toFixed(1) ?? '—', unit: 'drops/min' },
            { label: 'Max Flow', value: summary.max_flow?.toFixed(1) ?? '—', unit: 'drops/min' },
            { label: 'Avg Temperature', value: summary.avg_temperature?.toFixed(1) ?? '—', unit: '°C' },
          ].map(({ label, value, unit }) => (
            <div key={label} className="bg-white p-4 border border-[#e2e8f0] shadow-card">
              <span className="text-label-sm text-[#707881] uppercase font-semibold block mb-1">{label}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-telemetry-md text-[#161c27] tabular-nums">{value}</span>
                <span className="text-body-sm text-[#3f4850]">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flow chart */}
      <div className="bg-white p-4 border border-[#e2e8f0] shadow-card mb-4">
        <h2 className="text-headline-sm text-[#161c27] mb-1">Flow Rate Trend</h2>
        <p className="text-body-sm text-[#707881] mb-3">Last {hours}h — drops/min</p>
        {flowValues.length < 2 ? (
          <EmptyState icon="show_chart" title="Not enough data" subtitle="Telemetry data will appear here as it is collected." />
        ) : (
          <div className="w-full h-40 bg-[#f9f9ff] border border-[#f1f3ff]">
            <svg viewBox="0 0 600 120" className="w-full h-full" preserveAspectRatio="none">
              {/* Target line at 25 drops/min */}
              <line x1="0" y1="60" x2="600" y2="60" stroke="#bfc7d2" strokeWidth="1" strokeDasharray="4 4" />
              <path
                d={buildPath(flowValues, 120, 600)}
                fill="none"
                stroke="#006194"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Temperature chart */}
      <div className="bg-white p-4 border border-[#e2e8f0] shadow-card mb-4">
        <h2 className="text-headline-sm text-[#161c27] mb-1">Temperature Trend</h2>
        <p className="text-body-sm text-[#707881] mb-3">Last {hours}h — °C</p>
        {tempValues.length < 2 ? (
          <EmptyState icon="device_thermostat" title="Not enough data" subtitle="Temperature data will appear here." />
        ) : (
          <div className="w-full h-40 bg-[#f9f9ff] border border-[#f1f3ff]">
            <svg viewBox="0 0 600 120" className="w-full h-full" preserveAspectRatio="none">
              <path
                d={buildPath(tempValues, 120, 600)}
                fill="none"
                stroke="#006781"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Alert count */}
      {summary && (
        <div className="bg-white p-4 border border-[#e2e8f0] shadow-card flex items-center gap-4">
          <span className="material-symbols-outlined text-[32px] text-[#d97706]">notifications</span>
          <div>
            <span className="text-label-sm text-[#707881] uppercase font-semibold block">Alerts in Period</span>
            <span className="text-telemetry-md tabular-nums text-[#161c27]">{summary.alert_count}</span>
          </div>
        </div>
      )}
    </div>
  );
}
