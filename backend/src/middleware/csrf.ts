/**
 * CSRF protection middleware - registered as a global preHandler hook.
 *
 * Two independent layers applied to all state-mutating methods (POST, PUT, PATCH, DELETE):
 *
 * Layer 1 - Origin header check:
 *   Browsers always send the Origin header on cross-origin requests. If present, it
 *   must match FRONTEND_ORIGIN exactly (after port normalization). Wrong origin → 403.
 *
 * Layer 2 - Double-submit cookie:
 *   On login the server sets a non-httpOnly `csrf` cookie alongside the httpOnly `token`.
 *   Requests that arrive with a cookie session but no Origin header must echo the
 *   `csrf` cookie value in an `X-CSRF-Token` request header. A script on another
 *   origin cannot read the cookie, so cannot forge the header - even without SameSite.
 *
 * Bearer token callers (PATs, App Registrations) skip both layers - they authenticate
 * with a header, don't use cookies, and are not susceptible to CSRF attacks.
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Strip default ports so http://host:80 and http://host compare as equal
function normalizeOrigin(o: string): string {
  try {
    const u = new URL(o);
    // Browsers omit the default port from the Origin header
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = '';
    }
    return u.origin;
  } catch {
    return o;
  }
}

export async function csrfCheck(req: FastifyRequest, reply: FastifyReply) {
  // Only state-mutating methods need CSRF protection
  if (!MUTATING_METHODS.has(req.method)) return;

  // Bearer callers authenticate without cookies - no CSRF risk
  const isBearerAuth = !!req.headers.authorization?.startsWith('Bearer ');
  if (isBearerAuth) return;

  const origin = req.headers.origin;

  // Layer 1: Origin present - enforce it matches the allowed frontend
  if (origin) {
    const allowed = normalizeOrigin(config.frontendOrigin);
    if (normalizeOrigin(origin) !== allowed) {
      return reply.status(403).send({ error: 'CSRF check failed: origin not allowed' });
    }
    return; // Origin matched - allow
  }

  // Layer 2: No Origin header and using cookie auth - require double-submit token
  const hasCookieSession = !!(req.cookies as Record<string, string | undefined>)['token'];
  if (hasCookieSession) {
    const csrfCookie = (req.cookies as Record<string, string | undefined>)['csrf'];
    const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return reply.status(403).send({
        error: 'CSRF check failed: missing or invalid X-CSRF-Token header',
      });
    }
  }
  // No cookie session and no Origin = non-browser API call - allow
}
