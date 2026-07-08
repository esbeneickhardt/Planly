/**
 * Realtime routes — WebSocket connection endpoint and one-time ticket issuance.
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
import { joinRoom, leaveRoom, canJoin } from '../realtime/manager';
import { issueTicket, consumeTicket } from '../realtime/ws-tickets';
import { requireAuth } from '../middleware/auth';
import type { AuthPayload } from '../middleware/auth';
import { createHash } from 'crypto';
import prisma from '../db/client';

export async function realtimeRoutes(app: FastifyInstance) {
  // Issue a short-lived (30s) single-use WS ticket so the session JWT never appears in query strings.
  app.post('/api/products/:productId/ws-ticket', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const userId = req.user.userId;
    const member = await prisma.teamMember.findFirst({
      where: { userId, team: { products: { some: { id: productId, deletedAt: null } } } },
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

    // 1. Cookie JWT (preferred for browser clients)
    const cookieToken = req.cookies?.token;
    if (cookieToken) {
      try {
        const payload = jwt.verify(cookieToken, config.jwtSecret, { algorithms: ['HS256'] }) as AuthPayload;
        if (typeof payload.tokenVersion !== 'number') {
          ws.close(1008, 'Unauthorized');
          return;
        }
        const userRow = await prisma.user.findUnique({ where: { id: payload.userId }, select: { tokenVersion: true } });
        if (!userRow || userRow.tokenVersion !== payload.tokenVersion) {
          ws.close(1008, 'Unauthorized');
          return;
        }
        userId = payload.userId;
      } catch { /* invalid or expired JWT in Authorization header — fall through to ticket auth */ }
    }

    // 2. One-time ticket (issued via POST /ws-ticket — session JWT never in query string)
    if (!userId) {
      const ticket = (req.query as Record<string, string | undefined>).ticket;
      if (ticket) {
        userId = await consumeTicket(ticket) ?? null;
      }
    }

    // 3. API PAT (for automation/server-to-server — not session JWTs)
    if (!userId) {
      const queryToken = (req.query as Record<string, string | undefined>).token;
      if (queryToken) {
        const tokenHash = createHash('sha256').update(queryToken).digest('hex');
        const apiToken = await prisma.apiToken.findUnique({
          where: { tokenHash },
          select: { userId: true, expiresAt: true },
        });
        if (apiToken && (!apiToken.expiresAt || apiToken.expiresAt > new Date())) {
          userId = apiToken.userId;
        }
      }
    }

    if (!userId) {
      ws.send(JSON.stringify({ event: 'error', data: 'Unauthorized' }));
      ws.close(1008, 'Unauthorized');
      return;
    }

    // Enforce per-user connection limit before touching the DB
    if (!canJoin(userId)) {
      ws.send(JSON.stringify({ event: 'error', data: 'Too many open connections' }));
      ws.close(1008, 'Too many connections');
      return;
    }

    // Verify membership
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { team: { select: { members: { where: { userId }, select: { userId: true } } } } },
    });
    if (!product || product.team.members.length === 0) {
      ws.send(JSON.stringify({ event: 'error', data: 'Forbidden' }));
      ws.close(1008, 'Forbidden');
      return;
    }

    joinRoom(productId, ws, userId);
    ws.send(JSON.stringify({ event: 'connected', data: { productId } }));

    ws.on('close', () => leaveRoom(productId, ws, userId));
    ws.on('error', () => leaveRoom(productId, ws, userId));
  });
}
