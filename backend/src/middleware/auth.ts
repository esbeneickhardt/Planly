/**
 * Authentication middleware - validates incoming requests and populates req.user.
 *
 * Two authentication paths:
 *   Bearer token - PATs and App Registration tokens stored as SHA-256 hashes.
 *                  Checked first; if a Bearer header is present and invalid, the
 *                  request is rejected immediately (no cookie fallback).
 *   Cookie JWT   - httpOnly 'token' cookie set on login. The tokenVersion field
 *                  in the JWT payload is compared against the live DB value so that
 *                  password changes and admin logouts take effect instantly.
 *
 * requireAuth - validates token + enforces email verification if enabled.
 * requireAdmin - same as requireAuth plus checks isAdmin: true on the user row.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import prisma from '../db/client';
import { config } from '../config/env';
import { getServerConfig } from '../utils/server-config';
import { getClientIp, matchesCidr, isLocalhost } from '../utils/ip';

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

// Claims decoded from a verified JWT or resolved from a PAT lookup.
// The raw token string is never stored here - it stays in the HttpOnly cookie
// and is consumed only inside validateToken below.
export interface AuthPayload {
  userId: string;
  username: string;
  appName?: string;                       // set when the Bearer token belongs to an App Registration (not a PAT)
  appPermissions?: Record<string, string>; // per-tab permission levels stored on the AppRegistration
  scopedProductId?: string;               // set when the Bearer token is locked to a specific project
  tokenVersion?: number;                  // absent on PAT-authenticated requests; checked against DB on cookie auth
}

// Augments FastifyRequest so req.user is typed everywhere without casting.
// Set by validateToken before any route handler runs.
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthPayload;
  }
}

// Called by requireAuth after the JWT is validated to enforce email verification policy.
// Skipped for exempt routes and for admin routes (admins must stay in control of the toggle).
async function enforceEmailVerification(req: FastifyRequest, reply: FastifyReply) {
  if (EMAIL_VERIFY_EXEMPT.has(req.routeOptions?.url ?? (req.url.split('?')[0] ?? ''))) return;
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
        select: { id: true, userId: true, productId: true, expiresAt: true, user: { select: { username: true } }, app: { select: { name: true, permissions: true } } },
      });
      if (apiToken && (!apiToken.expiresAt || apiToken.expiresAt > new Date())) {
        req.user = {
          userId: apiToken.userId,
          username: apiToken.app?.name ?? apiToken.user.username,
          ...(apiToken.app ? {
            appName: apiToken.app.name,
            appPermissions: (apiToken.app.permissions ?? {}) as Record<string, string>,
          } : {}),
          ...(apiToken.productId ? { scopedProductId: apiToken.productId } : {}),
        };
        prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

        // Enforce product scope atomically here - the global preHandler hook runs before
        // requireAuth sets req.user so it cannot do this check reliably.
        if (apiToken.productId) {
          const scope = apiToken.productId;
          if (req.url.startsWith('/api/admin')) {
            reply.status(403).send({ error: 'Scoped tokens cannot access admin endpoints' });
            return false;
          }
          const m = req.url.match(/\/api\/products\/([^/?]+)/);
          if (m && m[1] !== scope) {
            reply.status(403).send({ error: 'Token is not authorized for this project' });
            return false;
          }
        }
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
      const payload = jwt.verify(cookieToken, config.jwtSecret, { algorithms: ['HS256'] }) as AuthPayload;
      // tokenVersion is an incrementing integer on the user row.
      // Password change, password reset, and admin logout all increment it,
      // instantly invalidating every outstanding session without maintaining a blocklist.
      // Tokens issued before tokenVersion was introduced won't have this field; treat them as expired.
      if (typeof payload.tokenVersion !== 'number') {
        reply.clearCookie('token', { path: '/' }).clearCookie('csrf', { path: '/' }).status(401).send({ error: 'Session expired, please log in again' });
        return false;
      }
      // One DB hit per request to catch invalidations that happened after the JWT was issued.
      // !userRow means the account was deleted; version mismatch means password changed / forced logout.
      const userRow = await prisma.user.findUnique({ where: { id: payload.userId }, select: { tokenVersion: true } });
      if (!userRow || userRow.tokenVersion !== payload.tokenVersion) {
        reply.clearCookie('token', { path: '/' }).clearCookie('csrf', { path: '/' }).status(401).send({ error: 'Unauthorized' });
        return false;
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

// Validates the session and enforces email verification if the server requires it.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const ok = await validateToken(req, reply);
  if (!ok) return;
  await enforceEmailVerification(req, reply);
}

// Same as requireAuth plus an isAdmin check; also enforces admin-scoped IP restrictions.
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const ok = await validateToken(req, reply);
  if (!ok) return;
  // Admins are subject to email verification like everyone else
  await enforceEmailVerification(req, reply);
  if (reply.sent) return;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return reply.status(403).send({ error: 'Admin access required' });

  // Admin-scope IP restriction — always exempt the management endpoints so admins can never
  // lock themselves out of the controls needed to fix a misconfiguration
  const ip = getClientIp(req as never);
  if (!isLocalhost(ip)) {
    const [allowlist, blocklist] = await Promise.all([
      prisma.adminIpRestriction.findMany({ where: { listType: 'allowlist' }, select: { cidr: true } }),
      prisma.adminIpRestriction.findMany({ where: { listType: 'blocklist' }, select: { cidr: true } }),
    ]);
    if (blocklist.some((r) => matchesCidr(ip, r.cidr))) {
      return reply.status(403).send({ error: 'Admin access denied: your IP has been blocked.', code: 'ADMIN_IP_BLOCKED' });
    }
    if (allowlist.length > 0 && !allowlist.some((r) => matchesCidr(ip, r.cidr))) {
      return reply.status(403).send({ error: 'Admin access denied: your IP is not on the admin allowlist.', code: 'ADMIN_IP_BLOCKED' });
    }
  }
}
