// IVaaRA – Root Application
// Single-page app with shared layout + page routing

import { useCallback, useEffect, useState } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { useWebSocket } from './hooks/useWebSocket';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AlertsPage } from './pages/AlertsPage';
import { DevicesPage } from './pages/DevicesPage';
import { OverviewPage } from './pages/OverviewPage';
import { HistoryPage, PatientsPage, SettingsPage } from './pages/PlaceholderPages';
import { fetchSystemStatus } from './services/api';
import type { SystemStatus, WSMessage } from './types';

type Page = 'overview' | 'devices' | 'alerts' | 'analytics' | 'history' | 'settings' | 'patients';

export default function App() {
  const [activePage, setActivePage] = useState<Page>('overview');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  const { connected, subscribe } = useWebSocket();

  // Initial system status load
  useEffect(() => {
    const load = () => {
      fetchSystemStatus()
        .then((s) => {
          setSystemStatus(s);
          setActiveAlertCount(s.active_alerts);
        })
        .catch(console.error);
    };
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Live alert count from WebSocket
  useEffect(() => {
    const unsubAlert = subscribe('alert', () => {
      setActiveAlertCount((c) => c + 1);
      // Refresh system status
      fetchSystemStatus().then(setSystemStatus).catch(console.error);
    });
    const unsubUpdate = subscribe('alert_update', (msg: WSMessage) => {
      const d = msg.data as { status: string };
      if (d.status !== 'ACTIVE') {
        setActiveAlertCount((c) => Math.max(0, c - 1));
      }
    });
    return () => { unsubAlert(); unsubUpdate(); };
  }, [subscribe]);

  // Navigate to device overview when clicking a device in fleet
  const handleNavigateToDevice = useCallback((deviceId: string) => {
    setActivePage('overview');
    // The OverviewPage will pick up the device via its own state
    // We store the intended device in sessionStorage as a signal
    sessionStorage.setItem('ivara_focus_device', deviceId);
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage subscribe={subscribe} />;
      case 'devices':
        return <DevicesPage subscribe={subscribe} onNavigateToDevice={handleNavigateToDevice} />;
      case 'alerts':
        return <AlertsPage subscribe={subscribe} />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'history':
        return <HistoryPage />;
      case 'settings':
        return <SettingsPage />;
      case 'patients':
        return <PatientsPage />;
      default:
        return <OverviewPage subscribe={subscribe} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff]">
      {/* Left sidebar – fixed */}
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        systemStatus={systemStatus}
        activeAlertCount={activeAlertCount}
        wsConnected={connected}
      />

      {/* Main content area – offset by sidebar width */}
      <div className="pl-60">
        {/* Top header – fixed */}
        <Header systemStatus={systemStatus} wsConnected={connected} />

        {/* Page content – below header */}
        <main className="pt-14 w-full min-h-screen bg-[#f9f9ff] px-6 py-4">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
