import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import prisma from '../db/client';
import { getServerConfig } from '../utils/server-config';

// Routes where an authenticated but unverified user must still be allowed through
// (so they can verify themselves or change their password)
const EMAIL_VERIFY_EXEMPT = new Set([
  '/api/auth/me',
  '/api/auth/send-verification',
  '/api/auth/resend-verification',
  '/api/auth/change-password',
  '/api/auth/verify-email',
  '/api/auth/logout',
  '/api/admin/server-config', // admins must be able to turn off verification even if unverified
]);

export interface AuthPayload {
  userId: string;
  username: string;
  scopedProductId?: string; // set when the Bearer token is locked to a specific project
  tv?: number; // tokenVersion — present in cookie JWTs issued after this feature was added
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthPayload;
  }
}

// Called by requireAuth after the JWT is validated to enforce email verification policy.
// Skipped for exempt routes and for admin routes (admins must stay in control of the toggle).
async function enforceEmailVerification(req: FastifyRequest, reply: FastifyReply) {
  if (EMAIL_VERIFY_EXEMPT.has(req.routerPath ?? req.url.split('?')[0])) return;
  const cfg = await getServerConfig();
  if (!cfg.requireEmailVerification) return;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) {
    reply.status(403).send({ error: 'Please verify your email address to continue.', code: 'EMAIL_NOT_VERIFIED' });
  }
}

async function validateToken(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  // 1. Bearer token auth - checked first so an explicit token is never shadowed by a browser cookie.
  //    When a Bearer header is present, we validate it exclusively; if it fails we return 401
  //    immediately rather than falling through to the cookie. This ensures revoked/expired tokens
  //    are correctly rejected even on the same origin as the web app.
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    try {
      const apiToken = await prisma.apiToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, productId: true, expiresAt: true, user: { select: { username: true } } },
      });
      if (apiToken && (!apiToken.expiresAt || apiToken.expiresAt > new Date())) {
        req.user = {
          userId: apiToken.userId,
          username: apiToken.user.username,
          ...(apiToken.productId ? { scopedProductId: apiToken.productId } : {}),
        };
        prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        return true;
      }
    } catch {
      // DB error - fall through to 401
    }
    reply.status(401).send({ error: 'Unauthorized' });
    return false;
  }

  // 2. Cookie-based auth (web app sessions)
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as AuthPayload;
      // Verify tokenVersion when present — invalidates sessions after password change/reset
      if (typeof payload.tv === 'number') {
        const userRow = await prisma.user.findUnique({ where: { id: payload.userId }, select: { tokenVersion: true } });
        if (!userRow || userRow.tokenVersion !== payload.tv) {
          reply.clearCookie('token', { path: '/' }).status(401).send({ error: 'Unauthorized' });
          return false;
        }
      }
      req.user = payload;
      return true;
    } catch {
      // invalid/expired
    }
  }

  reply.status(401).send({ error: 'Unauthorized' });
  return false;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const ok = await validateToken(req, reply);
  if (!ok) return;
  await enforceEmailVerification(req, reply);
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const ok = await validateToken(req, reply);
  if (!ok) return;
  // Admins are subject to email verification like everyone else
  await enforceEmailVerification(req, reply);
  if (reply.sent) return;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) reply.status(403).send({ error: 'Admin access required' });
}
