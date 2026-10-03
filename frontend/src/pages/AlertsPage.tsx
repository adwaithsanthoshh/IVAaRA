// IVaaRA – Alerts & Warnings Management Page
// Ported from Stitch screen: "Alerts & Warnings Management"

import { useEffect, useState } from 'react';
import { acknowledgeAlert, fetchAlerts } from '../services/api';
import type { Alert, WSMessage } from '../types';
import {
  EmptyState,
  SectionHeader,
  SeverityBadge,
  Spinner,
} from '../ui';

interface AlertsPageProps {
  subscribe: (type: string, handler: (msg: WSMessage) => void) => () => void;
}

export function AlertsPage({ subscribe }: AlertsPageProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ALL');
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const loadAlerts = () => {
    const params = filter === 'ALL' ? {} : { status: filter };
    fetchAlerts(params)
      .then(setAlerts)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    loadAlerts();
  }, [filter]);

  // Live new alerts via WebSocket
  useEffect(() => {
    const unsub = subscribe('alert', (msg: WSMessage) => {
      const newAlert = msg.data as unknown as Alert;
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    });
    const unsubUpdate = subscribe('alert_update', (msg: WSMessage) => {
      const update = msg.data as { alert_id: string; status: string };
      setAlerts((prev) =>
        prev.map((a) => (a.id === update.alert_id ? { ...a, status: update.status as Alert['status'] } : a))
      );
    });
    return () => { unsub(); unsubUpdate(); };
  }, [subscribe]);

  const handleAcknowledge = async (alertId: string) => {
    setAcknowledging(alertId);
    try {
      const updated = await acknowledgeAlert(alertId, 'Acknowledged by operator');
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? updated : a)));
    } catch (e) {
      console.error(e);
    } finally {
      setAcknowledging(null);
    }
  };

  const displayed = filter === 'ALL' ? alerts : alerts.filter((a) => a.status === filter);
  const activeCount = alerts.filter((a) => a.status === 'ACTIVE').length;
  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length;

  const statusColor = (status: Alert['status']) =>
    status === 'ACTIVE' ? 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]'
    : status === 'ACKNOWLEDGED' ? 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]'
    : 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]';

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col w-full">
      <SectionHeader
        title="Alerts & Warnings Management"
        subtitle="Clinical alert tracking and acknowledgement workflow"
        breadcrumb={['Workstation', 'Alerts']}
      />

      {/* Alert summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active Alerts', value: activeCount, icon: 'notifications_active', color: 'text-[#ba1a1a]', bg: 'bg-[#fef2f2]' },
          { label: 'Critical', value: criticalCount, icon: 'crisis_alert', color: 'text-[#ba1a1a]', bg: 'bg-[#ffdad6]' },
          { label: 'Acknowledged', value: alerts.filter((a) => a.status === 'ACKNOWLEDGED').length, icon: 'check_circle', color: 'text-[#92400e]', bg: 'bg-[#fffbeb]' },
          { label: 'Resolved Today', value: alerts.filter((a) => a.status === 'RESOLVED').length, icon: 'verified', color: 'text-[#065f46]', bg: 'bg-[#ecfdf5]' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} className={`${bg} p-4 border border-[#e2e8f0] shadow-card flex items-center gap-3`}>
            <span className={`material-symbols-outlined text-[28px] ${color}`}>{icon}</span>
            <div>
              <span className="text-label-sm text-[#707881] uppercase font-semibold block">{label}</span>
              <span className={`text-telemetry-md tabular-nums font-bold ${color}`}>{value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 border border-[#e2e8f0] mb-4 w-fit bg-white shadow-card">
        {(['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 text-label-md transition-colors border-r border-[#e2e8f0] last:border-0 ${
              filter === tab
                ? 'bg-[#007bb9] text-white font-semibold'
                : 'text-[#3f4850] hover:bg-[#f1f3ff]'
            }`}
          >
            {tab}
            {tab === 'ACTIVE' && activeCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-[#ba1a1a] text-white text-[10px] rounded font-bold">
                {activeCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alerts list */}
      {displayed.length === 0 ? (
        <EmptyState icon="notifications_off" title="No alerts" subtitle="No alerts match the current filter." />
      ) : (
        <div className="flex flex-col gap-3">
          {displayed.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white border shadow-card p-4 flex flex-col gap-2 ${
                alert.status === 'ACTIVE' && alert.severity === 'CRITICAL'
                  ? 'border-[#ba1a1a]'
                  : 'border-[#e2e8f0]'
              }`}
            >
              {/* Alert header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <SeverityBadge severity={alert.severity} />
                  <span className={`text-label-sm font-bold uppercase px-2 py-0.5 border rounded ${statusColor(alert.status)}`}>
                    {alert.status}
                  </span>
                  <span className="text-code text-[#006194] font-bold">{alert.device_id}</span>
                  <span className="text-body-sm text-[#707881]">{alert.alert_type}</span>
                </div>
                <span className="text-label-sm text-[#707881] whitespace-nowrap">
                  {new Date(alert.timestamp).toLocaleString()}
                </span>
              </div>

              {/* Message */}
              <p className="text-body-md text-[#161c27]">{alert.message}</p>

              {/* Action taken */}
              {alert.action_taken && (
                <div className="flex items-center gap-1 text-body-sm text-[#006781]">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  <span>Action: {alert.action_taken}</span>
                </div>
              )}

              {/* Acknowledge button for active alerts */}
              {alert.status === 'ACTIVE' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    disabled={acknowledging === alert.id}
                    className="px-3 py-1 bg-[#006194] text-white text-label-md rounded hover:bg-[#004b73] transition-colors disabled:opacity-50"
                  >
                    {acknowledging === alert.id ? 'Acknowledging…' : 'Acknowledge'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
