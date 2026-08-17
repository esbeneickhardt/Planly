/**
 * Realtime routes - WebSocket connection endpoint and one-time ticket issuance.
 *
 * Auth flow for browser clients:
 *   1. POST /api/products/:productId/ws-ticket → 30-second single-use ticket
 *   2. Open WebSocket at /api/products/:productId/ws?ticket=<token>
 *   3. Server consumes the ticket (deletes from DB) and validates it immediately
 *
 * The ticket pattern prevents the session JWT from ever appearing in a URL query
 * string (which would be logged by servers and proxies).
 *
 * Fallback auth: cookie JWT (browser same-origin) or API PAT (?token=).
 * All three paths verify membership before joining the product's WebSocket room.
 */
import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { joinRoom, leaveRoom, canJoin, checkWsRateLimit } from '../realtime/manager';
import { issueTicket, consumeTicket } from '../realtime/ws-tickets';
import { requireAuth } from '../middleware/auth';
import type { AuthPayload } from '../middleware/auth';
import { getClientIp } from '../utils/ip';
import { createHash } from 'crypto';
import prisma from '../db/client';

export async function realtimeRoutes(app: FastifyInstance) {
  // Issue a short-lived (30s) single-use WS ticket so the session JWT never appears in query strings.
  app.post('/api/products/:productId/ws-ticket', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const userId = req.user.userId;
    const member = await prisma.teamMember.findFirst({
      where: {
        userId,
        team: { products: { some: { id: productId, deletedAt: null } } },
      },
    });
    if (!member) return reply.status(403).send({ error: 'Forbidden' });
    const ticket = await issueTicket(userId);
    reply.send({ ticket });
  });

  // WebSocket endpoint - clients subscribe to a product's event stream.
  // Auth: cookie JWT (preferred), one-time ticket (?ticket=), or API PAT (?token=).
  // Session JWTs must NOT be passed as ?token= (use ?ticket= instead to avoid logging).
  app.get('/api/products/:productId/ws', { websocket: true }, async (socket, req) => {
    const ws = socket;
    const { productId } = req.params as { productId: string };

    // Authenticate
    let userId: string | null = null;
    // Set only by the API-PAT path (#3) below, when that token is locked to a single project.
    let patScopedProductId: string | undefined;

    // 1. Cookie JWT (preferred for browser clients)
    const cookieToken = req.cookies?.token;
    if (cookieToken) {
      try {
        const payload = jwt.verify(cookieToken, config.jwtSecret, {
          algorithms: ['HS256'],
        }) as AuthPayload;
        if (typeof payload.tokenVersion !== 'number') {
          ws.close(1008, 'Unauthorized');
          return;
        }
        const userRow = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { tokenVersion: true },
        });
        if (!userRow || userRow.tokenVersion !== payload.tokenVersion) {
          ws.close(1008, 'Unauthorized');
          return;
        }
        userId = payload.userId;
      } catch {
        /* invalid or expired JWT in Authorization header - fall through to ticket auth */
      }
    }

    // 2. One-time ticket (issued via POST /ws-ticket - session JWT never in query string)
    if (!userId) {
      const ticket = (req.query as Record<string, string | undefined>).ticket;
      if (ticket) {
        userId = (await consumeTicket(ticket)) ?? null;
      }
    }

    // 3. API PAT (for automation/server-to-server - not session JWTs)
    if (!userId) {
      const queryToken = (req.query as Record<string, string | undefined>).token;
      if (queryToken) {
        const tokenHash = createHash('sha256').update(queryToken).digest('hex');
        const apiToken = await prisma.apiToken.findUnique({
          where: { tokenHash },
          select: { userId: true, expiresAt: true, productId: true },
        });
        if (apiToken && (!apiToken.expiresAt || apiToken.expiresAt > new Date())) {
          userId = apiToken.userId;
          patScopedProductId = apiToken.productId ?? undefined;
        }
      }
    }

    // Reject unauthenticated connections
    if (!userId) {
      ws.send(JSON.stringify({ event: 'error', data: 'Unauthorized' }));
      ws.close(1008, 'Unauthorized');
      return;
    }

    // A PAT scoped to a different project must not be able to join this room, even if the
    // underlying user is (also) a genuine member of it. The global URL-regex scope check in
    // middleware/auth.ts only guards ordinary Bearer-authenticated HTTP requests - this WebSocket
    // upgrade authenticates itself independently above and never goes through that check.
    if (patScopedProductId && patScopedProductId !== productId) {
      ws.send(
        JSON.stringify({
          event: 'error',
          data: 'Token is not authorized for this project',
        }),
      );
      ws.close(1008, 'Forbidden');
      return;
    }

    // Per-IP connection rate limit - rejects upgrade storms before any DB work
    if (!checkWsRateLimit(getClientIp(req as never))) {
      ws.send(
        JSON.stringify({
          event: 'error',
          data: 'Too many connections from your IP',
        }),
      );
      ws.close(1008, 'Rate limited');
      return;
    }

    // Enforce per-user connection limit before touching the DB
    if (!canJoin(userId)) {
      ws.send(JSON.stringify({ event: 'error', data: 'Too many open connections' }));
      ws.close(1008, 'Too many connections');
      return;
    }

    // Verify membership
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        team: {
          select: {
            members: { where: { userId }, select: { userId: true } },
          },
        },
      },
    });
    if (!product || product.team.members.length === 0) {
      ws.send(JSON.stringify({ event: 'error', data: 'Forbidden' }));
      ws.close(1008, 'Forbidden');
      return;
    }

    // Join the product room and confirm the connection to the client
    joinRoom(productId, ws, userId);
    ws.send(JSON.stringify({ event: 'connected', data: { productId } }));

    // Ping every 25 s to keep the connection alive through nginx's proxy_read_timeout
    const heartbeat = setInterval(() => {
      if (ws.readyState === 1 /* OPEN */) ws.ping();
    }, 25000);

    // Clean up on disconnect or error
    ws.on('close', () => {
      clearInterval(heartbeat);
      leaveRoom(productId, ws, userId);
    });
    ws.on('error', () => {
      clearInterval(heartbeat);
      leaveRoom(productId, ws, userId);
    });
  });
}
