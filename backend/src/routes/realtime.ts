import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { joinRoom, leaveRoom } from '../realtime/manager';
import type { AuthPayload } from '../middleware/auth';
import { createHash } from 'crypto';
import prisma from '../db/client';

export async function realtimeRoutes(app: FastifyInstance) {
  // WebSocket endpoint — clients subscribe to a product's event stream.
  // Auth: cookie JWT or Bearer token passed as ?token=<raw> query parameter.
  app.get('/api/products/:productId/ws', { websocket: true }, async (connection, req) => {
    const ws = connection.socket;
    const { productId } = req.params as { productId: string };

    // Authenticate
    let userId: string | null = null;

    // 1. Cookie JWT
    const cookieToken = req.cookies?.token;
    if (cookieToken) {
      try {
        const payload = jwt.verify(cookieToken, config.jwtSecret) as AuthPayload;
        userId = payload.userId;
      } catch {}
    }

    // 2. Bearer token via query param (for environments where WS headers are limited)
    if (!userId) {
      const queryToken = (req.query as Record<string, string>).token;
      if (queryToken) {
        // Try JWT first
        try {
          const payload = jwt.verify(queryToken, config.jwtSecret) as AuthPayload;
          userId = payload.userId;
        } catch {
          // Try API token
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
    }

    if (!userId) {
      ws.send(JSON.stringify({ event: 'error', data: 'Unauthorized' }));
      ws.close(1008, 'Unauthorized');
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

    joinRoom(productId, ws);
    ws.send(JSON.stringify({ event: 'connected', data: { productId } }));

    ws.on('close', () => leaveRoom(productId, ws));
    ws.on('error', () => leaveRoom(productId, ws));
  });
}
