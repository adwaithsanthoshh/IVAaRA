// IVaaRA Mobile — Design tokens
export const Colors = {
  primary: '#006194',
  primaryDark: '#004b73',
  accent: '#2ec4b6',
  bg: '#f4f7fb',
  card: '#ffffff',
  border: '#e2e8f0',
  textPrimary: '#161c27',
  textSecondary: '#707881',
  textMuted: '#94a3b8',
  online: '#22c55e',
  offline: '#ef4444',
  warning: '#f59e0b',
  critical: '#dc2626',
  low: '#22c55e',
  moderate: '#f59e0b',
  elevated: '#f97316',
  riskCritical: '#dc2626',
  aiBlue: '#006194',
} as const;

export const riskColor = (level: string | null): string => {
  switch (level?.toLowerCase()) {
    case 'low': return Colors.low;
    case 'moderate': return Colors.moderate;
    case 'high':
    case 'elevated': return Colors.elevated;
    case 'critical': return Colors.critical;
    default: return Colors.textMuted;
  }
};

export const severityColor = (sev: string): string => {
  switch (sev) {
    case 'CRITICAL': return Colors.critical;
    case 'WARNING': return Colors.warning;
    default: return Colors.primary;
  }
};
