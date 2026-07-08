/**
 * Auth cookie helpers — issue and clear the paired session cookies.
 *
 * Login sets two cookies simultaneously:
 *   `token`  — httpOnly JWT (7 days). The browser sends it automatically; JS cannot read it.
 *   `csrf`   — non-httpOnly random value (7 days). JS reads it and echoes it as X-CSRF-Token
 *              on every mutating request. An attacker on another origin cannot read this
 *              cookie, so cannot forge the header.
 *
 * Both cookies share the same expiry and Secure flag so they always expire together.
 */
import type { FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Sets the `token` (httpOnly) and `csrf` (readable by JS) cookies on the reply.
 * Call this after issuing a signed JWT to complete the login handshake.
 */
export function issueAuthCookie(reply: FastifyReply, token: string): void {
  const secure = process.env.COOKIE_SECURE !== 'false';
  reply.setCookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure,
  });
  // Double-submit CSRF cookie: readable by JS (not httpOnly) so the frontend can echo it as
  // X-CSRF-Token. An attacker on another origin cannot read this cookie, so cannot forge the header.
  reply.setCookie('csrf', randomBytes(24).toString('base64url'), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure,
  });
}

/** Clears both auth cookies. Call on logout and session invalidation. */
export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('token', { path: '/' });
  reply.clearCookie('csrf', { path: '/' });
}
