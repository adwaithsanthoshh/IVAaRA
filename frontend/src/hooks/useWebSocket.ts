// IVaaRA – WebSocket hook
// Maintains a persistent WS connection with auto-reconnect.
// Components subscribe to typed message streams.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WSMessage } from '../types';

export type MessageHandler = (msg: WSMessage) => void;

export interface UseWebSocketReturn {
  connected: boolean;
  lastMessage: WSMessage | null;
  subscribe: (type: string, handler: MessageHandler) => () => void;
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
const RECONNECT_DELAY_MS = 3000;

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const dispatch = useCallback((msg: WSMessage) => {
    setLastMessage(msg);
    // Notify type-specific subscribers
    const typeHandlers = handlersRef.current.get(msg.type);
    typeHandlers?.forEach((h) => h(msg));
    // Notify wildcard subscribers
    const wildcardHandlers = handlersRef.current.get('*');
    wildcardHandlers?.forEach((h) => h(msg));
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSMessage;
        dispatch(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, [dispatch]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    // Heartbeat: send ping every 25s to keep connection alive
    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 25000);

    return () => {
      mountedRef.current = false;
      clearInterval(heartbeat);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback(
    (type: string, handler: MessageHandler): (() => void) => {
      if (!handlersRef.current.has(type)) {
        handlersRef.current.set(type, new Set());
      }
      handlersRef.current.get(type)!.add(handler);
      return () => {
        handlersRef.current.get(type)?.delete(handler);
      };
    },
    [],
  );

  return { connected, lastMessage, subscribe };
}
