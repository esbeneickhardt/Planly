/**
 * Unit tests for the realtime manager.
 *
 * Tests cover:
 *   - Per-user connection cap (canJoin / joinRoom / leaveRoom)
 *   - Per-IP WS connection rate limiter (checkWsRateLimit)
 *   - Redis pub/sub broadcast path: broadcast() must publish to the correct
 *     channel with a valid JSON payload, and the local pmessage callback must
 *     deliver cross-replica messages to open sockets in the target room.
 *
 * The ioredis module is mocked with vi.hoisted + vi.mock so the manager module
 * initialises against the fake client instead of requiring a real Redis process.
 * REDIS_URL is also set via vi.hoisted so it is present when the manager module
 * is imported (module-level side effects run at import time).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type WebSocket from 'ws';

// ── Hoist everything that must exist before vi.mock runs ──────────────────
const { mockPublish, mockPsubscribe, getPmessageHandler, capturePmessageHandler } = vi.hoisted(() => {
  // Set REDIS_URL here so it is present when the manager module is imported
  process.env.REDIS_URL = 'redis://mock:6379';

  const mockPublish = vi.fn().mockResolvedValue(1);
  const mockPsubscribe = vi.fn();
  let _handler: ((pat: string, ch: string, msg: string) => void) | null = null;
  const capturePmessageHandler = (h: (pat: string, ch: string, msg: string) => void) => {
    _handler = h;
  };
  const getPmessageHandler = () => _handler;
  return {
    mockPublish,
    mockPsubscribe,
    getPmessageHandler,
    capturePmessageHandler,
  };
});

// ── Mock ioredis with a real class so `new Redis()` works ─────────────────
vi.mock('ioredis', () => ({
  default: class MockRedis {
    publish = mockPublish;
    psubscribe = mockPsubscribe;
    on(event: string, handler: (pat: string, ch: string, msg: string) => void) {
      if (event === 'pmessage') capturePmessageHandler(handler);
    }
  },
}));

// Static import - resolves AFTER the hoisted vi.hoisted + vi.mock have run
import { canJoin, joinRoom, leaveRoom, broadcast, checkWsRateLimit } from '../../realtime/manager';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeFakeWs(open = true): WebSocket {
  return { readyState: open ? 1 : 3, send: vi.fn() } as unknown as WebSocket;
}

function uid() {
  return 'u-' + Math.random().toString(36).slice(2);
}
function randIp() {
  return `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}.1`;
}

// ── Per-user connection cap ───────────────────────────────────────────────

describe('canJoin', () => {
  it('allows the first connection for a new user', () => {
    expect(canJoin(uid())).toBe(true);
  });

  it('allows up to 10 connections then rejects the 11th', () => {
    const userId = uid();
    const wss: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      expect(canJoin(userId)).toBe(true);
      const ws = makeFakeWs();
      wss.push(ws);
      joinRoom('p-cap', ws, userId);
    }
    expect(canJoin(userId)).toBe(false);
    wss.forEach((ws) => leaveRoom('p-cap', ws, userId));
  });
});

describe('joinRoom / leaveRoom', () => {
  it('releases the connection slot so a new join is allowed after disconnect', () => {
    const userId = uid();
    const ws = makeFakeWs();
    joinRoom('p-lc', ws, userId);
    leaveRoom('p-lc', ws, userId);
    expect(canJoin(userId)).toBe(true);
  });
});

// ── Per-IP WS connection rate limiter ─────────────────────────────────────

describe('checkWsRateLimit', () => {
  it('allows up to 30 connection attempts per IP per minute', () => {
    const clientIp = randIp();
    for (let i = 0; i < 30; i++) {
      expect(checkWsRateLimit(clientIp)).toBe(true);
    }
  });

  it('rejects the 31st attempt from the same IP within the window', () => {
    const clientIp = randIp();
    for (let i = 0; i < 30; i++) checkWsRateLimit(clientIp);
    expect(checkWsRateLimit(clientIp)).toBe(false);
  });

  it('treats distinct IPs independently', () => {
    const a = randIp(),
      b = randIp();
    for (let i = 0; i < 30; i++) checkWsRateLimit(a);
    expect(checkWsRateLimit(a)).toBe(false);
    expect(checkWsRateLimit(b)).toBe(true);
  });
});

// ── broadcast via Redis pub/sub ───────────────────────────────────────────

describe('broadcast (Redis path)', () => {
  beforeEach(() => {
    mockPublish.mockClear();
  });

  it('publishes to the planly:room:<productId> channel', async () => {
    broadcast('prod-123', 'task.updated', { id: 't1' });
    await vi.waitFor(() => expect(mockPublish).toHaveBeenCalled());
    const [channel] = mockPublish.mock.calls[0] as [string, string];
    expect(channel).toBe('planly:room:prod-123');
  });

  it('publishes a JSON payload containing event, data, and ts fields', async () => {
    const before = Date.now();
    broadcast('prod-ts', 'sprint.created', { name: 'Sprint 1' });
    await vi.waitFor(() => expect(mockPublish).toHaveBeenCalled());
    const [, message] = mockPublish.mock.calls[0] as [string, string];
    const parsed = JSON.parse(message) as {
      event: string;
      data: unknown;
      ts: number;
    };
    expect(parsed.event).toBe('sprint.created');
    expect(parsed.data).toEqual({ name: 'Sprint 1' });
    expect(parsed.ts).toBeGreaterThanOrEqual(before);
  });

  it('pmessage handler delivers cross-replica messages to sockets in the matching room', () => {
    const userId = uid();
    const ws = makeFakeWs();
    joinRoom('prod-redis', ws, userId);

    const payload = JSON.stringify({
      event: 'message.created',
      data: {},
      ts: Date.now(),
    });
    getPmessageHandler()!('planly:room:*', 'planly:room:prod-redis', payload);

    expect(ws.send).toHaveBeenCalledWith(payload);
    leaveRoom('prod-redis', ws, userId);
  });

  it('does NOT deliver messages intended for a different product room', () => {
    const userId = uid();
    const ws = makeFakeWs();
    joinRoom('prod-room-A', ws, userId);

    const payload = JSON.stringify({ event: 'test', data: {}, ts: Date.now() });
    getPmessageHandler()!('planly:room:*', 'planly:room:B', payload);

    expect(ws.send).not.toHaveBeenCalled();
    leaveRoom('prod-room-A', ws, userId);
  });

  it('skips closed sockets when delivering cross-replica messages', () => {
    const userId = uid();
    const closedWs = makeFakeWs(false);
    joinRoom('prod-closed', closedWs, userId);

    const payload = JSON.stringify({ event: 'ping', data: {}, ts: Date.now() });
    getPmessageHandler()!('planly:room:*', 'planly:room:prod-closed', payload);

    expect(closedWs.send).not.toHaveBeenCalled();
    leaveRoom('prod-closed', closedWs, userId);
  });
});
