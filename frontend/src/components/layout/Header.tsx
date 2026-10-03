// IVaaRA – Top header bar
// Matches Stitch design: breadcrumb, sync indicator, clock, failsafe badge

import { useEffect, useState } from 'react';
import type { SystemStatus } from '../../types';

interface HeaderProps {
  systemStatus: SystemStatus | null;
  wsConnected: boolean;
}

function useLiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-GB', { hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function Header({ systemStatus, wsConnected }: HeaderProps) {
  const clock = useLiveClock();
  const hasCritical = (systemStatus?.critical_alerts ?? 0) > 0;

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-[#bfc7d2] z-40 px-4 flex items-center justify-between">
      {/* Left – breadcrumb */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-label-md text-[#3f4850]">
          <span className="material-symbols-outlined text-[16px] text-[#707881]">domain</span>
          <span>ICU CENTRAL</span>
          <span className="text-[#707881]">&gt;</span>
          <span className="text-[#161c27] font-semibold">POD B CLUSTER</span>
        </div>
        <div className="h-4 w-px bg-[#bfc7d2]" />
        <div className="flex items-center gap-1 text-code text-[#3f4850]">
          <span className="text-label-sm text-[#707881] uppercase">Active Rack:</span>
          <span className="bg-[#e8eeff] px-1.5 py-0.5 rounded text-[#006194] font-bold border border-[#bfc7d2] text-code">
            RACK-B4-PUMP
          </span>
        </div>
      </div>

      {/* Right – sync, clock, failsafe */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {/* WebSocket sync indicator */}
          <div className={`flex items-center gap-1.5 text-code text-[#3f4850] bg-[#f1f3ff] px-2 py-1 rounded border border-[#bfc7d2]`}>
            <span className={`material-symbols-outlined text-[16px] ${wsConnected ? 'text-[#006948]' : 'text-[#707881]'}`}>
              {wsConnected ? 'sync' : 'sync_disabled'}
            </span>
            <span>{wsConnected ? 'LIVE' : 'RECONNECTING'}</span>
          </div>

          {/* Live clock */}
          <div className="flex items-center gap-1.5 text-code font-bold text-[#161c27] bg-[#f1f3ff] px-2 py-1 rounded border border-[#bfc7d2]">
            <span className="material-symbols-outlined text-[16px] text-[#707881]">schedule</span>
            <span id="live-clock">{clock} UTC</span>
          </div>
        </div>

        {/* Failsafe / critical alert indicator */}
        {hasCritical ? (
          <div className="flex items-center gap-1 bg-[#ffdad6] text-[#93000a] px-2.5 py-1 rounded border border-[#ba1a1a]/20 text-label-sm font-semibold pulse-critical">
            <span className="material-symbols-outlined text-[16px] text-[#ba1a1a]">crisis_alert</span>
            <span>CRITICAL ALERT</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-[#ffdad6] text-[#93000a] px-2.5 py-1 rounded border border-[#ba1a1a]/20 text-label-sm font-semibold">
            <span className="material-symbols-outlined text-[16px] text-[#ba1a1a]">emergency</span>
            <span>FAILSAFE ARMED</span>
          </div>
        )}
      </div>
    </header>
  );
}
