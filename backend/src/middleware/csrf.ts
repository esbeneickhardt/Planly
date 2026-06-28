import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection via Origin header validation.
 * - Allows requests with no Origin (scripts, curl, API tokens from server-side callers)
 * - Allows requests from the configured FRONTEND_ORIGIN
 * - Blocks requests from any other origin
 *
 * Combined with SameSite=lax cookies this makes CSRF practically impossible.
 * Non-browser callers (curl, scripts) use Bearer tokens which bypass cookies entirely.
 */
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
  if (!MUTATING_METHODS.has(req.method)) return;

  const origin = req.headers.origin;
  if (!origin) return; // non-browser caller — allowed (API token auth)

  const allowed = normalizeOrigin(config.frontendOrigin);
  if (normalizeOrigin(origin) !== allowed) {
    return reply.status(403).send({ error: 'CSRF check failed: origin not allowed' });
  }
}
