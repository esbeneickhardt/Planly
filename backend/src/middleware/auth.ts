import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import prisma from '../db/client';

export interface AuthPayload {
  userId: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthPayload;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  // 1. Cookie-based auth (web app sessions)
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try {
      req.user = jwt.verify(cookieToken, process.env.JWT_SECRET!) as AuthPayload;
      return;
    } catch {
      // invalid/expired — fall through to Bearer check
    }
  }

  // 2. Bearer token auth (API access tokens)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    try {
      const apiToken = await prisma.apiToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, user: { select: { username: true } } },
      });
      if (apiToken && (!apiToken.expiresAt || apiToken.expiresAt > new Date())) {
        req.user = { userId: apiToken.userId, username: apiToken.user.username };
        // Update lastUsedAt without blocking the response
        prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        return;
      }
    } catch {
      // DB error — fall through to 401
    }
  }

  reply.status(401).send({ error: 'Unauthorized' });
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) reply.status(403).send({ error: 'Admin access required' });
}
