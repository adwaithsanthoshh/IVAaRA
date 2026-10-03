// IVaaRA – Shared UI primitives

import type { AlertSeverity, DeviceStatus, RiskLevel } from '../../types';

// ── Status badge ──────────────────────────────────────────────
interface StatusBadgeProps {
  label: string;
  variant: 'nominal' | 'warning' | 'critical' | 'offline' | 'info';
  dot?: boolean;
  pulse?: boolean;
}

export function StatusBadge({ label, variant, dot = false, pulse = false }: StatusBadgeProps) {
  const styles = {
    nominal:  'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]',
    warning:  'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]',
    critical: 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]',
    offline:  'bg-[#f1f3ff] text-[#707881] border border-[#bfc7d2]',
    info:     'bg-[#e8eeff] text-[#006194] border border-[#bfc7d2]',
  };
  const dotColors = {
    nominal:  'bg-[#059669]',
    warning:  'bg-[#d97706]',
    critical: 'bg-[#dc2626]',
    offline:  'bg-[#707881]',
    info:     'bg-[#006194]',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-label-sm font-semibold ${styles[variant]}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} ${pulse ? 'animate-pulse' : ''}`} />
      )}
      {label}
    </span>
  );
}

// ── Risk level badge ─────────────────────────────────────────
export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  const map: Record<RiskLevel, StatusBadgeProps['variant']> = {
    LOW: 'nominal',
    MODERATE: 'warning',
    HIGH: 'warning',
    CRITICAL: 'critical',
  };
  return <StatusBadge label={`${level} (${score})`} variant={map[level]} dot />;
}

// ── Device status badge ──────────────────────────────────────
export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  if (status === 'ONLINE') return <StatusBadge label="ONLINE" variant="nominal" dot pulse />;
  if (status === 'OFFLINE') return <StatusBadge label="OFFLINE" variant="offline" dot />;
  return <StatusBadge label="ERROR" variant="critical" dot pulse />;
}

// ── Severity badge ───────────────────────────────────────────
export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const map: Record<AlertSeverity, StatusBadgeProps['variant']> = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical',
  };
  return <StatusBadge label={severity} variant={map[severity]} />;
}

// ── Telemetry value card ─────────────────────────────────────
interface TelemetryCardProps {
  label: string;
  value: string | number | null;
  unit?: string;
  subtext?: string;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  icon?: string;
}

export function TelemetryCard({ label, value, unit, subtext, badge, footer, icon }: TelemetryCardProps) {
  return (
    <div className="bg-white p-4 shadow-card border border-[#e2e8f0] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-label-sm uppercase tracking-wider text-[#707881] font-semibold">{label}</span>
          {badge ?? (icon && <span className="material-symbols-outlined text-[18px] text-[#006781]">{icon}</span>)}
        </div>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-telemetry-lg text-[#161c27] tabular-nums">
            {value !== null && value !== undefined ? value : '—'}
          </span>
          {unit && <span className="text-body-sm text-[#3f4850] font-medium">{unit}</span>}
        </div>
        {subtext && <div className="text-[#3f4850] text-body-sm mt-0.5">{subtext}</div>}
      </div>
      {footer && <div className="mt-4 pt-2 bg-[#f1f3ff]/50 p-2">{footer}</div>}
    </div>
  );
}

// ── Section header ───────────────────────────────────────────
export function SectionHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex flex-col">
        {breadcrumb && (
          <div className="flex items-center gap-1 text-label-sm text-[#707881] uppercase tracking-wider font-semibold mb-0.5">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className={i === breadcrumb.length - 1 ? 'text-[#006194]' : ''}>
                {crumb}{i < breadcrumb.length - 1 && <span className="mx-1">/</span>}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-headline-lg text-[#161c27] tracking-tight">{title}</h1>
        {subtitle && <p className="text-body-sm text-[#3f4850]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Confirmation dialog ──────────────────────────────────────
interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, confirmVariant = 'danger', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white border border-[#bfc7d2] shadow-modal rounded-lg p-6 w-[400px]">
        <h2 className="text-headline-sm text-[#161c27] mb-2">{title}</h2>
        <p className="text-body-md text-[#3f4850] mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-white border border-[#cbd5e1] text-[#161c27] text-label-md rounded hover:bg-[#f1f3ff] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white font-bold text-label-md rounded transition-colors ${
              confirmVariant === 'danger'
                ? 'bg-[#dc2626] hover:bg-[#b91c1c]'
                : 'bg-[#006194] hover:bg-[#004b73]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mini sparkline bar ────────────────────────────────────────
export function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end h-6 gap-0.5">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1 bg-[#006194] rounded-sm"
          style={{ height: `${Math.round((v / max) * 24)}px` }}
        />
      ))}
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 border-2 border-[#bfc7d2] border-t-[#006194] rounded-full animate-spin" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="material-symbols-outlined text-[48px] text-[#bfc7d2] mb-3">{icon}</span>
      <p className="text-headline-sm text-[#3f4850]">{title}</p>
      {subtitle && <p className="text-body-sm text-[#707881] mt-1">{subtitle}</p>}
    </div>
  );
}
