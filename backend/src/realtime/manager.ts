import type WebSocket from 'ws';

// productId -> set of connected clients
const rooms = new Map<string, Set<WebSocket>>();

export function joinRoom(productId: string, ws: WebSocket) {
  if (!rooms.has(productId)) rooms.set(productId, new Set());
  rooms.get(productId)!.add(ws);
}

export function leaveRoom(productId: string, ws: WebSocket) {
  const room = rooms.get(productId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(productId);
}

export function broadcast(productId: string, event: string, data?: unknown) {
  const room = rooms.get(productId);
  if (!room || room.size === 0) return;
  const message = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of room) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message);
    }
  }
}
