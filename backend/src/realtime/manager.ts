import type WebSocket from 'ws';
import Redis from 'ioredis';

// productId -> set of connected clients
const rooms = new Map<string, Set<WebSocket>>();

// userId -> set of open sockets (across all products)
const userConnections = new Map<string, Set<WebSocket>>();

const MAX_CONNECTIONS_PER_USER = 10;
const CHANNEL_PREFIX = 'planly:room:';

// Redis pub/sub — only active when REDIS_URL is set (opt-in for horizontal scaling)
let publisher: Redis | null = null;

if (process.env.REDIS_URL) {
  publisher = new Redis(process.env.REDIS_URL);
  const subscriber = new Redis(process.env.REDIS_URL);

  subscriber.psubscribe(`${CHANNEL_PREFIX}*`, (err) => {
    if (err) console.error('[realtime] Redis psubscribe error', err);
  });

  subscriber.on('pmessage', (_pattern, channel, message) => {
    const productId = channel.slice(CHANNEL_PREFIX.length);
    broadcastLocal(productId, message);
  });
}

function broadcastLocal(productId: string, serialized: string) {
  const room = rooms.get(productId);
  if (!room || room.size === 0) return;
  for (const client of room) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(serialized);
    }
  }
}

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

export function wsConnectionCount(): number {
  let total = 0;
  for (const set of rooms.values()) total += set.size;
  return total;
}

export function broadcast(productId: string, event: string, data?: unknown) {
  const message = JSON.stringify({ event, data, ts: Date.now() });
  if (publisher) {
    publisher.publish(`${CHANNEL_PREFIX}${productId}`, message).catch(() => {});
  } else {
    broadcastLocal(productId, message);
  }
}
