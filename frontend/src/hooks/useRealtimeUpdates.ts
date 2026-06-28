import { useEffect, useRef } from 'react';

interface RealtimeEvent {
  event: string;
  data?: unknown;
  ts?: number;
}

export function useRealtimeUpdates(
  productId: string | null | undefined,
  onEvent: (e: RealtimeEvent) => void,
) {
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

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as RealtimeEvent;
          if (parsed.event !== 'connected') {
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
