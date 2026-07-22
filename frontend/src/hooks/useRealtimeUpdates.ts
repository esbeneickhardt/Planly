/**
 * useRealtimeUpdates - subscribes to a project's WebSocket event stream and
 * calls onEvent for each incoming message.
 *
 * Connects using the cookie session (sent automatically by the browser on the
 * upgrade request). Automatically reconnects with exponential backoff (1s → 30s)
 * on close. Reconnect state is reset to 1s on a successful open.
 *
 * The onEvent callback is held in a ref so callers can pass an inline function
 * without adding it to the effect dependency array.
 *
 * In development (port 5173) the connection targets port 3000 directly
 * since Vite's dev server does not proxy WebSocket upgrades.
 */
import { useEffect, useRef } from 'react';

interface RealtimeEvent {
  event: string;
  data?: unknown;
  ts?: number;
}

export function useRealtimeUpdates(productId: string | null | undefined, onEvent: (e: RealtimeEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!productId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const isDev = window.location.port === '5173';
    const port = isDev ? '3000' : window.location.port;
    const url = `${protocol}//${host}:${port}/api/products/${productId}/ws`;

    let ws: WebSocket | null = null;
    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    let connectCount = 0;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as RealtimeEvent;
          if (parsed.event !== 'connected') {
            console.log('[WS] event received:', parsed.event);
            onEventRef.current(parsed);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (destroyed) return;
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onopen = () => {
        reconnectDelay = 1000;
        // On reconnect (not first connect) fire a synthetic event so callers can refresh missed data
        if (connectCount > 0) {
          onEventRef.current({ event: 'ws.reconnected' });
        }
        connectCount++;
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [productId]);
}
