/**
 * Auth cookie helpers - issue and clear the paired session cookies.
 *
 * Login sets three cookies simultaneously:
 *   `token`         - httpOnly JWT (1 hour). Short lifetime limits stolen-token damage.
 *   `csrf`          - non-httpOnly random value (30 days). JS reads it and echoes it as
 *                     X-CSRF-Token on every mutating request. An attacker on another origin
 *                     cannot read this cookie, so cannot forge the header.
 *   `refresh_token` - httpOnly (30 days), path-restricted to /api/auth/refresh-token so the
 *                     browser never sends it to any other endpoint. Used to rotate the JWT
 *                     without requiring a full re-login.
 *
 * The refresh_token cookie is optional — pass undefined when re-issuing a JWT without
 * minting a new refresh token (e.g. the /api/auth/refresh-token handler itself, which
 * sets both cookies in one call but wants precise control over the refresh value).
 */
import type { FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';

const JWT_MAX_AGE = 60 * 60; // 1 hour — short so stolen JWTs expire quickly
const RT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days for refresh token

function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE !== 'false';
}

// Sets the `token` JWT cookie, the `csrf` CSRF double-submit cookie, and optionally
// the `refresh_token` cookie. Call after every successful authentication event.
export function issueAuthCookie(reply: FastifyReply, jwtToken: string, refreshToken?: string): void {
  const secure = cookieSecure();
  reply.setCookie('token', jwtToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: JWT_MAX_AGE,
    secure,
  });
  // CSRF double-submit — readable by JS so the frontend can echo it as X-CSRF-Token
  reply.setCookie('csrf', randomBytes(24).toString('base64url'), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshToken ? RT_MAX_AGE : JWT_MAX_AGE,
    secure,
  });
  if (refreshToken !== undefined) {
    // Path-restricted: browser only sends this to the refresh endpoint, never to /api/*
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/auth/refresh-token',
      maxAge: RT_MAX_AGE,
      secure,
    });
  }
}

// Clears all three auth cookies. Call on logout and forced session invalidation.
export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('token', { path: '/' });
  reply.clearCookie('csrf', { path: '/' });
  reply.clearCookie('refresh_token', { path: '/api/auth/refresh-token' });
}
