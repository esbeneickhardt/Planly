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

// 10-second in-memory cache for the tokenVersion DB lookup.
// Every cookie-authenticated request would otherwise hit the DB; this keeps
// forced-logout latency within 10 s while eliminating >95 % of those queries
// under sustained load.  PAT / Bearer auth does not use this cache.
const _tvCache = new Map<string, { tokenVersion: number; expiresAt: number }>();
const TV_TTL_MS = 10_000;

function getCachedTokenVersion(userId: string): number | undefined {
  const entry = _tvCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _tvCache.delete(userId);
    return undefined;
  }
  return entry.tokenVersion;
}

function setCachedTokenVersion(userId: string, tokenVersion: number) {
  _tvCache.set(userId, { tokenVersion, expiresAt: Date.now() + TV_TTL_MS });
}

// Evict a user from the tokenVersion cache so the next request reads from the DB.
// Call this immediately after any in-process tokenVersion increment (password change,
// admin forced-logout) to prevent the 10-second cache window from masking the change.
export function invalidateCachedTokenVersion(userId: string) {
  _tvCache.delete(userId);
}

// 5-minute in-memory cache tracking the last time each user's `lastActiveAt` was written,
// same throttling idea as _tvCache above but for a much coarser signal - "last activity" only
// needs minute-level precision, so there's no reason to write on every single request.
const _lastActiveCache = new Map<string, number>();
const LAST_ACTIVE_TTL_MS = 5 * 60_000;

// Fire-and-forget - never awaited by callers, since touching this on every authenticated
// request must not add latency. Covers both Bearer and cookie auth, so API-token/App
// Registration usage counts as activity too, not just interactive logins.
function touchUserActivity(userId: string) {
  const last = _lastActiveCache.get(userId);
  const now = Date.now();
  if (last !== undefined && now - last < LAST_ACTIVE_TTL_MS) return;
  _lastActiveCache.set(userId, now);
  prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
}

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
  appName?: string; // set when the Bearer token belongs to an App Registration (not a PAT)
  appPermissions?: Record<string, string>; // per-tab permission levels stored on the AppRegistration
  scopedProductId?: string; // set when the Bearer token is locked to a specific project
  tokenVersion?: number; // absent on PAT-authenticated requests; checked against DB on cookie auth
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
  if (EMAIL_VERIFY_EXEMPT.has(req.routeOptions?.url ?? req.url.split('?')[0] ?? '')) return;
  const cfg = await getServerConfig();
  if (!cfg.requireEmailVerification) return;
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) {
    reply.status(403).send({
      error: 'Please verify your email address to continue.',
      code: 'EMAIL_NOT_VERIFIED',
    });
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
        select: {
          id: true,
          userId: true,
          productId: true,
          readOnly: true,
          expiresAt: true,
          user: { select: { username: true } },
          app: { select: { name: true, permissions: true } },
        },
      });
      if (apiToken && (!apiToken.expiresAt || apiToken.expiresAt > new Date())) {
        req.user = {
          userId: apiToken.userId,
          username: apiToken.app?.name ?? apiToken.user.username,
          ...(apiToken.app
            ? {
                appName: apiToken.app.name,
                appPermissions: (apiToken.app.permissions ?? {}) as Record<string, string>,
              }
            : {}),
          ...(apiToken.productId ? { scopedProductId: apiToken.productId } : {}),
        };
        prisma.apiToken
          .update({
            where: { id: apiToken.id },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => {});

        // Read-only tokens may only perform GET and HEAD requests
        if (apiToken.readOnly && req.method !== 'GET' && req.method !== 'HEAD') {
          reply.status(403).send({
            error: 'This token is read-only and cannot perform write operations',
          });
          return false;
        }

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
        touchUserActivity(apiToken.userId);
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
      const payload = jwt.verify(cookieToken, config.jwtSecret, {
        algorithms: ['HS256'],
      }) as AuthPayload;
      // tokenVersion is an incrementing integer on the user row.
      // Password change, password reset, and admin logout all increment it,
      // instantly invalidating every outstanding session without maintaining a blocklist.
      // Tokens issued before tokenVersion was introduced won't have this field; treat them as expired.
      if (typeof payload.tokenVersion !== 'number') {
        reply
          .clearCookie('token', { path: '/' })
          .clearCookie('csrf', { path: '/' })
          .status(401)
          .send({ error: 'Session expired, please log in again' });
        return false;
      }
      // Verify the tokenVersion in the JWT matches the DB - catches password changes
      // and forced logouts which increment the DB value. The 10-second cache means
      // we hit the DB at most once per user per 10 s instead of on every request.
      const cached = getCachedTokenVersion(payload.userId);
      let liveVersion: number | undefined = cached;
      if (liveVersion === undefined) {
        const userRow = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { tokenVersion: true },
        });
        if (!userRow) {
          reply
            .clearCookie('token', { path: '/' })
            .clearCookie('csrf', { path: '/' })
            .status(401)
            .send({ error: 'Unauthorized' });
          return false;
        }
        liveVersion = userRow.tokenVersion;
        setCachedTokenVersion(payload.userId, liveVersion);
      }
      if (liveVersion !== payload.tokenVersion) {
        reply
          .clearCookie('token', { path: '/' })
          .clearCookie('csrf', { path: '/' })
          .status(401)
          .send({ error: 'Unauthorized' });
        return false;
      }
      req.user = payload;
      touchUserActivity(payload.userId);
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

// Same as requireAuth, but rejects Bearer/PAT authentication entirely - only a real cookie login
// session may proceed. `tokenVersion` is only ever set on the cookie-auth path (see AuthPayload
// above), so its absence means this request came in via a Bearer token. Use this on
// credential-management routes (PATs, App Registrations): letting a token authenticate there
// would let it list/mint/revoke other tokens on the same account - including unscoped ones - which
// is a privilege-escalation path regardless of that token's own declared scope.
export async function requireInteractiveAuth(req: FastifyRequest, reply: FastifyReply) {
  const ok = await validateToken(req, reply);
  if (!ok) return;
  if (req.user.tokenVersion === undefined) {
    reply.status(403).send({
      error: 'This action requires an interactive login session, not an API token',
    });
    return;
  }
  await enforceEmailVerification(req, reply);
}

// Same as requireAuth plus an isAdmin check; also enforces admin-scoped IP restrictions.
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const ok = await validateToken(req, reply);
  if (!ok) return;
  // Admins are subject to email verification like everyone else
  await enforceEmailVerification(req, reply);
  if (reply.sent) return;
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return reply.status(403).send({ error: 'Admin access required' });

  // Admin-scope IP restriction - exempt the IP restriction management routes so an admin
  // who misconfigures rules can always fix it without needing server console access
  if (req.url.startsWith('/api/admin/admin-ip-restrictions') || req.url.startsWith('/api/admin/ip-restrictions'))
    return;

  const ip = getClientIp(req as never);
  if (!isLocalhost(ip)) {
    const [allowlist, blocklist] = await Promise.all([
      prisma.adminIpRestriction.findMany({
        where: { listType: 'allowlist' },
        select: { cidr: true },
      }),
      prisma.adminIpRestriction.findMany({
        where: { listType: 'blocklist' },
        select: { cidr: true },
      }),
    ]);
    if (blocklist.some((r) => matchesCidr(ip, r.cidr))) {
      return reply.status(403).send({
        error: 'Admin access denied: your IP has been blocked.',
        code: 'ADMIN_IP_BLOCKED',
      });
    }
    if (allowlist.length > 0 && !allowlist.some((r) => matchesCidr(ip, r.cidr))) {
      return reply.status(403).send({
        error: 'Admin access denied: your IP is not on the admin allowlist.',
        code: 'ADMIN_IP_BLOCKED',
      });
    }
  }
}
