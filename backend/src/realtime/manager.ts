import type WebSocket from 'ws';

// productId -> set of connected clients
const rooms = new Map<string, Set<WebSocket>>();

// userId -> set of open sockets (across all products)
const userConnections = new Map<string, Set<WebSocket>>();

const MAX_CONNECTIONS_PER_USER = 10;

export function canJoin(userId: string): boolean {
  const existing = userConnections.get(userId);
  return !existing || existing.size < MAX_CONNECTIONS_PER_USER;
}

export function joinRoom(productId: string, ws: WebSocket, userId: string) {
  if (!rooms.has(productId)) rooms.set(productId, new Set());
  rooms.get(productId)!.add(ws);

  if (!userConnections.has(userId)) userConnections.set(userId, new Set());
  userConnections.get(userId)!.add(ws);
}

export function leaveRoom(productId: string, ws: WebSocket, userId: string) {
  const room = rooms.get(productId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(productId);
  }
  const userSockets = userConnections.get(userId);
  if (userSockets) {
    userSockets.delete(ws);
    if (userSockets.size === 0) userConnections.delete(userId);
  }
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
