// IVaaRA – AIInsight Card component
// Displays structured Groq AI risk analysis on the dashboard

import { useCallback, useEffect, useState } from 'react';
import { analyzeDevice, getAIInsight, getAIStatus } from '../../services/api';
import type { AIInsight, AIStatus } from '../../services/api';

interface AIInsightCardProps {
  deviceId: string;
  /** Optional: trigger re-analysis when this key changes */
  refreshKey?: number;
}

function RiskPill({ level }: { level: string }) {
  const color =
    level === 'critical' ? 'bg-red-100 text-red-700 border-red-300'
    : level === 'elevated' ? 'bg-amber-100 text-amber-700 border-amber-300'
    : level === 'moderate' ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
    : level === 'low' ? 'bg-green-100 text-green-700 border-green-300'
    : 'bg-slate-100 text-slate-500 border-slate-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold uppercase tracking-wider ${color}`}>
      {level}
    </span>
  );
}

export function AIInsightCard({ deviceId, refreshKey }: AIInsightCardProps) {
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Load AI status once
  useEffect(() => {
    getAIStatus().then(setStatus).catch(console.error);
  }, []);

  // Fetch latest insight when device changes or refreshKey changes
  const fetchInsight = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const data = await getAIInsight(deviceId);
      setInsight(data);
      setLastUpdated(new Date());
    } catch {
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { fetchInsight(); }, [fetchInsight, refreshKey]);

  const handleAnalyzeNow = async () => {
    setAnalyzing(true);
    try {
      const data = await analyzeDevice(deviceId);
      setInsight(data);
      setLastUpdated(new Date());
    } catch {
      // Keep existing
    } finally {
      setAnalyzing(false);
    }
  };

  const aiUnavailable = status && !status.ai_available;

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#006194] text-[18px]">psychology</span>
          <span className="text-label-md font-bold text-[#161c27] uppercase tracking-wide">IVaaRA AI Insight</span>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
              status.ai_available
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}>
              {status.ai_available
                ? `AI ACTIVE · ${status.key_count} key${status.key_count !== 1 ? 's' : ''}`
                : status.status.replace(/_/g, ' ')}
            </span>
          )}
          <button
            onClick={handleAnalyzeNow}
            disabled={analyzing || !!aiUnavailable}
            className="text-[10px] px-2 py-0.5 border border-[#e2e8f0] rounded text-[#006194] hover:bg-[#f1f3ff] disabled:opacity-40 transition-colors font-semibold"
          >
            {analyzing ? '…' : 'Analyze Now'}
          </button>
        </div>
      </div>

      {/* Content */}
      {aiUnavailable ? (
        <div className="text-sm text-[#94a3b8] py-2">
          <p className="font-medium text-[#334155]">AI Unavailable</p>
          <p className="text-xs mt-0.5">Set <code className="bg-[#f1f3ff] px-1 rounded">GROQ_API_KEY</code> in backend <code>.env</code> to enable AI insights.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-2">
          <span className="text-[#94a3b8] text-sm animate-pulse">Fetching AI insight…</span>
        </div>
      ) : !insight ? (
        <p className="text-sm text-[#94a3b8]">No AI analysis available. Click "Analyze Now".</p>
      ) : (
        <>
          {/* Risk + Summary row */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#707881] uppercase font-semibold">Monitoring Priority</span>
              <RiskPill level={insight.risk_level} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#707881] uppercase font-semibold">Trend</span>
              <span className="text-xs font-semibold text-[#334155] uppercase">{insight.trend.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#707881] uppercase font-semibold">Anomaly</span>
              <span className={`text-xs font-bold uppercase ${insight.anomaly ? 'text-amber-600' : 'text-green-600'}`}>
                {insight.anomaly ? 'Detected' : 'None'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#707881] uppercase font-semibold">Confidence</span>
              <span className="text-xs font-semibold text-[#334155]">{Math.round(insight.confidence * 100)}%</span>
            </div>
          </div>

          {/* AI Explanation */}
          <div className="bg-[#f8faff] border border-[#e3e8f9] rounded p-3">
            <p className="text-[10px] text-[#707881] uppercase font-semibold mb-1">AI Explanation</p>
            <p className="text-sm text-[#334155] leading-relaxed">{insight.reason}</p>
          </div>

          {/* Recommendation */}
          {insight.recommendation && (
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[#006194] text-[14px] mt-0.5 flex-shrink-0">tips_and_updates</span>
              <p className="text-xs text-[#334155] leading-relaxed">{insight.recommendation}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-[#f1f3ff]">
            <span className="text-[10px] text-[#94a3b8]">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}
              {insight.model_used ? ` · ${insight.model_used}` : ''}
            </span>
            {insight.alert_required && (
              <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">warning</span>
                Alert recommended
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
