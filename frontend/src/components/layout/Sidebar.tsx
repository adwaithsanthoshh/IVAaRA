// IVaaRA – Sidebar navigation
// Faithfully ported from the Stitch design HTML

import type { SystemStatus } from '../../types';

type Page = 'overview' | 'devices' | 'alerts' | 'analytics' | 'history' | 'settings' | 'patients';

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  systemStatus: SystemStatus | null;
  activeAlertCount: number;
  wsConnected: boolean;
}

const navItems: { page: Page; icon: string; label: string }[] = [
  { page: 'overview',  icon: 'vital_signs',   label: 'Dashboard' },
  { page: 'patients',  icon: 'hotel',         label: 'Patients / Beds' },
  { page: 'devices',   icon: 'vaccines',      label: 'IV Devices' },
  { page: 'alerts',    icon: 'notifications', label: 'Alerts' },
  { page: 'analytics', icon: 'monitoring',    label: 'Analytics' },
  { page: 'history',   icon: 'history',       label: 'History' },
  { page: 'settings',  icon: 'tune',          label: 'Settings' },
];

export function Sidebar({ activePage, onNavigate, systemStatus, activeAlertCount, wsConnected }: SidebarProps) {
  const mqttOk = systemStatus?.mqtt_connected ?? false;

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-[#bfc7d2] z-50 flex flex-col justify-between select-none">
      {/* Brand */}
      <div className="flex flex-col">
        <div className="p-4 border-b border-[#bfc7d2]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded bg-[#006194] flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]">vaccines</span>
            </div>
            <div className="flex flex-col">
              <span className="text-headline-sm text-[#006194] leading-tight tracking-tight">IVaaRA</span>
              <span className="text-label-sm text-[#707881] uppercase tracking-wider font-semibold">Clinical OS</span>
            </div>
          </div>
          <p className="text-label-sm text-[#3f4850] leading-tight">
            Intra Venous Automation &amp; Response Architecture
          </p>
        </div>

        {/* Navigation */}
        <nav className="p-2 flex flex-col gap-0.5">
          {navItems.map(({ page, icon, label }) => {
            const isActive = activePage === page;
            return (
              <button
                key={page}
                onClick={() => onNavigate(page)}
                className={[
                  'flex items-center justify-between px-2 py-2 rounded text-body-md transition-colors w-full text-left',
                  isActive
                    ? 'bg-[#007bb9] text-white font-semibold'
                    : 'text-[#3f4850] hover:bg-[#e3e8f9] hover:text-[#161c27]',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">{icon}</span>
                  <span>{label}</span>
                </div>
                {page === 'alerts' && activeAlertCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-[#ba1a1a] text-white text-label-sm rounded text-[10px] font-bold">
                    {activeAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Status Footer */}
      <div className="p-2 flex flex-col gap-2 border-t border-[#bfc7d2] bg-[#f1f3ff]">
        {/* System link status */}
        <div className="p-2 bg-white border border-[#bfc7d2] rounded flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-label-sm text-[#707881] uppercase font-semibold">ESP32 Link</span>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#00855d] animate-pulse' : 'bg-[#ba1a1a]'}`} />
              <span className={`text-code font-bold ${wsConnected ? 'text-[#006948]' : 'text-[#ba1a1a]'}`}>
                {wsConnected ? 'Active' : 'No Link'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label-sm text-[#707881] uppercase font-semibold">MQTT Broker</span>
            <span className={`text-code font-medium ${mqttOk ? 'text-[#006781]' : 'text-[#ba1a1a]'}`}>
              {mqttOk ? `OK` : 'OFFLINE'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-label-sm text-[#707881] uppercase font-semibold">Devices</span>
            <span className="text-code text-[#161c27]">
              {systemStatus?.online_devices ?? 0}/{systemStatus?.total_devices ?? 0} Online
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
