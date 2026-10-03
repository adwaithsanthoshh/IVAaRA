// IVaaRA Mobile — Central configuration
// NEVER put GROQ_API_KEY here. Mobile only talks to the backend.

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const Config = {
  API_BASE_URL: API_URL,
  WS_URL: API_URL.replace(/^http/, 'ws') + '/ws',
  POLL_INTERVAL_MS: 4000,       // 4 seconds for live polling
  REQUEST_TIMEOUT_MS: 10000,    // 10s per request
  APP_NAME: 'IVaaRA',
  APP_VERSION: '1.0.0',
  APP_SUBTITLE: 'Intra Venous Automation & Response Architecture',
} as const;
