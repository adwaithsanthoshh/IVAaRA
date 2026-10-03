// IVaaRA – Settings & Auth Page
// Simple session-based login/logout with admin/admin default

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ivara_user';
const DEFAULT_USER = { username: 'admin', password: 'admin' };

export interface IVaraUser {
  username: string;
  loggedInAt: string;
}

// ── Auth helpers (exported so Sidebar/Header can use them) ─────
export function getStoredUser(): IVaraUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function storeUser(u: IVaraUser) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
}

function clearUser() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// ── Login form ─────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (u: IVaraUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === DEFAULT_USER.username && password === DEFAULT_USER.password) {
      const user: IVaraUser = { username, loggedInAt: new Date().toISOString() };
      storeUser(user);
      onLogin(user);
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded bg-[#006194] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[20px]">vaccines</span>
          </div>
          <div>
            <p className="text-headline-sm text-[#006194] leading-tight">IVaaRA</p>
            <p className="text-label-sm text-[#707881] uppercase tracking-wider">Clinical OS</p>
          </div>
        </div>
        <h2 className="text-lg font-bold text-[#161c27] mb-1">Sign In</h2>
        <p className="text-sm text-[#707881] mb-5">Enter your credentials to access the dashboard.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-label-sm text-[#707881] uppercase font-semibold block mb-1">Username</label>
            <input
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm text-[#161c27] focus:outline-none focus:border-[#006194]"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-label-sm text-[#707881] uppercase font-semibold block mb-1">Password</label>
            <input
              type="password"
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm text-[#161c27] focus:outline-none focus:border-[#006194]"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-[#006194] text-white rounded py-2 text-sm font-semibold hover:bg-[#004b73] transition-colors mt-1"
          >
            Sign In
          </button>
        </form>
        <p className="text-[10px] text-[#94a3b8] text-center mt-4">Default: admin / admin</p>
      </div>
    </div>
  );
}

// ── Logged-in Settings Panel ───────────────────────────────────
function SettingsPanel({ user, onLogout }: { user: IVaraUser; onLogout: () => void }) {
  const loggedInAt = new Date(user.loggedInAt);

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-[#161c27] mb-0.5">Settings</h1>
        <p className="text-sm text-[#707881]">Session and system configuration</p>
      </div>

      {/* Session card */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#e3e8f9] flex items-center justify-center">
            <span className="material-symbols-outlined text-[#006194] text-[22px]">person</span>
          </div>
          <div>
            <p className="font-bold text-[#161c27]">{user.username}</p>
            <p className="text-sm text-[#707881]">Operator account</p>
          </div>
          <span className="ml-auto text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-semibold">Active</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm border-t border-[#f1f3ff] pt-3">
          <div>
            <span className="text-[#707881] text-xs uppercase font-semibold">Logged in</span>
            <p className="text-[#161c27] mt-0.5">{loggedInAt.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-[#707881] text-xs uppercase font-semibold">Role</span>
            <p className="text-[#161c27] mt-0.5">Administrator</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="mt-4 flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded text-sm font-semibold hover:bg-red-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          Sign Out
        </button>
      </div>

      {/* System info */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card p-5">
        <h3 className="font-bold text-[#161c27] mb-3">System Information</h3>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between py-1 border-b border-[#f1f3ff]">
            <span className="text-[#707881]">Application</span>
            <span className="text-[#161c27] font-medium">IVaaRA Clinical OS</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[#f1f3ff]">
            <span className="text-[#707881]">Version</span>
            <span className="text-[#161c27] font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[#f1f3ff]">
            <span className="text-[#707881]">Backend</span>
            <span className="text-[#161c27] font-medium">FastAPI + SQLite</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[#f1f3ff]">
            <span className="text-[#707881]">MQTT Broker</span>
            <span className="text-[#161c27] font-medium">Eclipse Mosquitto 2.0</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[#f1f3ff]">
            <span className="text-[#707881]">AI Provider</span>
            <span className="text-[#161c27] font-medium">Groq (llama-3.3-70b)</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-[#707881]">Description</span>
            <span className="text-[#161c27] font-medium text-right max-w-[60%]">Intra Venous Automation &amp; Response Architecture</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────
export function SettingsPage() {
  const [user, setUser] = useState<IVaraUser | null>(getStoredUser);

  // Sync across tabs
  useEffect(() => {
    const handler = () => setUser(getStoredUser());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  if (!user) {
    return <LoginForm onLogin={(u) => setUser(u)} />;
  }

  return (
    <SettingsPanel
      user={user}
      onLogout={() => {
        clearUser();
        setUser(null);
      }}
    />
  );
}

// ── PatientsPage placeholder (kept here to not change App.tsx imports) ──
export function PatientsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="material-symbols-outlined text-[64px] text-[#bfc7d2] mb-4">hotel</span>
      <h1 className="text-headline-lg text-[#161c27] mb-2">Patients / Beds</h1>
      <p className="text-body-md text-[#3f4850]">Patient and bed management is coming in the next release.</p>
    </div>
  );
}

// ── HistoryPage placeholder ────────────────────────────────────
export function HistoryPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="material-symbols-outlined text-[64px] text-[#bfc7d2] mb-4">history</span>
      <h1 className="text-headline-lg text-[#161c27] mb-2">Session History</h1>
      <p className="text-body-md text-[#3f4850]">
        View past infusion sessions and telemetry archives. Use the <strong>Analytics</strong> page for trend data.
      </p>
    </div>
  );
}
