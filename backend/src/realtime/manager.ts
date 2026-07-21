/**
 * WebSocket room manager - tracks connected clients by project room and user,
 * and fans out event messages to every open socket in a room.
 *
 * When REDIS_URL is set, a Redis pub/sub channel is used so that broadcasts
 * are forwarded across all backend replicas. Without Redis, broadcast is
 * local-only (single-instance deployments).
 */
import type WebSocket from 'ws';
import Redis from 'ioredis';

// In-memory connection state (scoped to this process)
// productId -> set of connected clients
const rooms = new Map<string, Set<WebSocket>>();

// userId -> set of open sockets (across all products)
const userConnections = new Map<string, Set<WebSocket>>();

const MAX_CONNECTIONS_PER_USER = 10;

// Per-IP WebSocket connection rate limiter.
// Limits how many new WS upgrade attempts a single IP can make per minute,
// preventing a storm of cheap connections from monopolising the upgrade handler
// even when the per-user cap (MAX_CONNECTIONS_PER_USER) would otherwise allow it.
const _wsRateMap = new Map<string, { count: number; resetAt: number }>();
const WS_RATE_MAX = 30;      // new connections per IP per window
const WS_RATE_WINDOW = 60_000; // 1-minute sliding window

/** Returns true when the IP is within rate limit, false when the limit is exceeded. */
export function checkWsRateLimit(ip: string): boolean {
  const now = Date.now();
  const state = _wsRateMap.get(ip);
  if (!state || now > state.resetAt) {
    _wsRateMap.set(ip, { count: 1, resetAt: now + WS_RATE_WINDOW });
    return true;
  }
  state.count += 1;
  return state.count <= WS_RATE_MAX;
}
const CHANNEL_PREFIX = 'planly:room:';

// Redis pub/sub - only active when REDIS_URL is set (opt-in for horizontal scaling)
let publisher: Redis | null = null;

if (process.env.REDIS_URL) {
  // Separate publisher and subscriber clients - ioredis requires two connections
  publisher = new Redis(process.env.REDIS_URL);
  const subscriber = new Redis(process.env.REDIS_URL);

  // Subscribe to all room channels using a wildcard pattern
  subscriber.psubscribe(`${CHANNEL_PREFIX}*`, (err) => {
    if (err) console.error('[realtime] Redis psubscribe error', err);
  });

  // Deliver messages received from other replicas to local sockets
  subscriber.on('pmessage', (_pattern, channel, message) => {
    const productId = channel.slice(CHANNEL_PREFIX.length);
    broadcastLocal(productId, message);
  });
}

// Send a pre-serialized message to every open socket in the room on this replica
function broadcastLocal(productId: string, serialized: string) {
  const room = rooms.get(productId);
  if (!room || room.size === 0) return;
  for (const client of room) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(serialized);
    }
  }
}

// Connection lifecycle helpers

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
    // Remove the room entry when empty to prevent unbounded map growth
    if (room.size === 0) rooms.delete(productId);
  }
  const userSockets = userConnections.get(userId);
  if (userSockets) {
    userSockets.delete(ws);
    if (userSockets.size === 0) userConnections.delete(userId);
  }
}

// Returns total live socket count across all rooms (used by admin stats)
export function wsConnectionCount(): number {
  let total = 0;
  for (const set of rooms.values()) total += set.size;
  return total;
}

// Public broadcast entry point - routes via Redis when available, local otherwise
export function broadcast(productId: string, event: string, data?: unknown) {
  const message = JSON.stringify({ event, data, ts: Date.now() });
  if (publisher) {
    publisher.publish(`${CHANNEL_PREFIX}${productId}`, message).catch(() => {});
  } else {
    broadcastLocal(productId, message);
  }
}

// Broadcast to every connected socket across all rooms (server-wide events like announcement comments)
export function broadcastAll(event: string, data?: unknown) {
  const message = JSON.stringify({ event, data, ts: Date.now() });
  for (const room of rooms.values()) {
    for (const client of room) {
      if (client.readyState === 1 /* OPEN */) {
        try { client.send(message); } catch {}
      }
    }
  }
}
