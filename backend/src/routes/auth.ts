/**
 * Authentication routes
 *     - login
 *     - logout
 *     - registration
 *     - email verification
 *     - session refresh (refresh token rotation)
 *     - /me.
 *
 * Session lifecycle:
 *    - Login issues a 1-hour JWT + a 30-day refresh token (both httpOnly cookies).
 *      Short JWT lifetime limits the damage window if a token is stolen.
 *    - The refresh token is path-restricted to /api/auth/refresh-token so it is
 *      never sent to any other endpoint.
 *    - Rotation: POST /api/auth/refresh-token issues a new JWT + new refresh token
 *      (same family). If a consumed token is re-presented, the entire family is revoked.
 *    - tokenVersion on the User row is incremented on password change/reset/admin logout,
 *      instantly invalidating every outstanding JWT without maintaining a blocklist.
 *    - TOTP-enabled accounts receive a 5-minute mfa_challenge JWT instead of a full session;
 *      the real session is only issued after POST /api/auth/totp/challenge succeeds.
 *    - Progressive lockout: 5 failures → lock. Lock count drives the duration:
 *      15 min → 60 min → 24 h → 7 days. Resets to 0 on successful login.
 */

import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { config } from '../config/env';
import { requireAuth, invalidateCachedTokenVersion } from '../middleware/auth';
import { issueAuthCookie, clearAuthCookies } from '../utils/auth-cookie';
import { issueRefreshToken, rotateRefreshToken, revokeRefreshFamily } from '../utils/refresh-tokens';
import { getServerConfig } from '../utils/server-config';
import { validate } from '../utils/validate';
import { loginSchema } from '../schemas/auth';
import { sendSecurityAlert } from '../utils/security-alert';
import { decryptUserPii } from '../utils/crypto';

// How many failed login attempts before lockout. Exported so the TOTP challenge endpoint
// (src/routes/totp.ts) can mirror the same progressive-lockout policy for 6-digit code guesses.
export const LOGIN_MAX_ATTEMPTS = 5;

// Progressive lockout: each successive lockout is longer.
// lockCount 0 → 15 min, 1 → 60 min, 2 → 1440 min (24h), 3+ → 10080 min (7 days / admin-unlock territory)
// Exported for reuse by the TOTP challenge endpoint (see above).
export function lockDurationMinutes(lockCount: number): number {
  const schedule = [15, 60, 1440, 10080];
  return schedule[Math.min(lockCount, schedule.length - 1)] ?? 10080;
}

// Login flow
export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = validate(loginSchema, req.body, reply);
    if (!body) return;
    const { identifier, password } = body;

    // Normalize identifier and look up user by email or username
    const trimmed = identifier.trim();
    const normalized = trimmed.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { username: { equals: trimmed, mode: 'insensitive' } }],
      },
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
        emailVerified: true,
        totpEnabled: true,
        failedLoginAttempts: true,
        loginLockedUntil: true,
        loginLockCount: true,
        realName: true,
        avatarEmoji: true,
        mustChangePassword: true,
        isAdmin: true,
        isFoundingAdmin: true,
      },
    });
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' });
    if (!user.passwordHash) return reply.status(401).send({ error: 'Invalid credentials' });

    // Check lockout status
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      const remaining = Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000);
      const hours = Math.floor(remaining / 60);
      const mins = remaining % 60;
      const timeStr = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins} minute${mins === 1 ? '' : 's'}`;
      return reply.status(429).send({
        error: `Account temporarily locked. Try again in ${timeStr}.`,
      });
    }

    // Validate password and record failed attempts / lockout
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= LOGIN_MAX_ATTEMPTS;
      const newLockCount = shouldLock ? user.loginLockCount + 1 : user.loginLockCount;
      const lockMinutes = lockDurationMinutes(user.loginLockCount);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          ...(shouldLock
            ? {
                loginLockedUntil: new Date(Date.now() + lockMinutes * 60 * 1000),
                loginLockCount: newLockCount,
              }
            : {}),
        },
      });
      await prisma.adminLog
        .create({
          data: {
            action: 'LOGIN_FAILED',
            targetName: user.username,
            metadata: { attempts },
          },
        })
        .catch((err) => {
          console.warn('[auth] Failed to write LOGIN_FAILED audit log:', (err as Error).message);
        });
      if (shouldLock) {
        await prisma.adminLog
          .create({
            data: {
              action: 'LOGIN_LOCKED',
              targetName: user.username,
              metadata: { lockCount: newLockCount, lockMinutes },
            },
          })
          .catch((err) => {
            console.warn('[auth] Failed to write LOGIN_LOCKED audit log:', (err as Error).message);
          });
        sendSecurityAlert({
          event: 'LOGIN_LOCKED',
          account: user.username,
          ip: req.ip,
          lockout_count: newLockCount,
          lockout_duration_minutes: lockMinutes,
          failed_attempts: LOGIN_MAX_ATTEMPTS,
          timestamp: new Date().toISOString(),
        });
        const hours = Math.floor(lockMinutes / 60);
        const mins = lockMinutes % 60;
        const timeStr =
          hours > 0
            ? `${hours} hour${hours === 1 ? '' : 's'}${mins > 0 ? ` ${mins} min` : ''}`
            : `${lockMinutes} minutes`;
        return reply.status(429).send({
          error: `Too many failed attempts. Account locked for ${timeStr}.`,
        });
      }
      // Same message as the "no such user" / "no password set" branches above - varying the text
      // based on which check failed (e.g. appending an "attempts remaining" count only when the
      // account exists) would let an attacker enumerate valid identifiers from the response body
      // alone, even though the status code is already identical (401) in both cases.
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Email verification gate - only enforced when the server requires it
    const serverConfig = await getServerConfig();
    if (!user.emailVerified && serverConfig.requireEmailVerification) {
      return reply.status(403).send({
        error: 'Please verify your email address before signing in. Check your inbox for a verification link.',
      });
    }

    // If TOTP is enabled, issue a short-lived challenge token instead of a session cookie.
    // tokenVersion is only incremented after TOTP verification succeeds (in /totp/challenge).
    if (user.totpEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          loginLockedUntil: null,
          loginLockCount: 0,
        },
      });
      const mfaToken = jwt.sign({ userId: user.id, type: 'mfa_challenge' }, config.jwtSecret, { expiresIn: '5m' });
      return reply.send({ requiresTOTP: true, mfaToken });
    }

    // Standard login (no TOTP) - reset lockout counters, rotate tokenVersion, stamp lastLoginAt
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        loginLockedUntil: null,
        loginLockCount: 0,
        tokenVersion: { increment: 1 },
        lastLoginAt: new Date(),
      },
      select: { tokenVersion: true },
    });
    // Evict the stale tokenVersion from the in-process cache so that the very next
    // request (e.g. GET /api/auth/me called in AuthContext right after login) sees
    // the new version and is not rejected with 401.
    invalidateCachedTokenVersion(user.id);

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        tokenVersion: updatedUser.tokenVersion,
      },
      config.jwtSecret,
      { expiresIn: '1h' },
    );

    await prisma.adminLog
      .create({
        data: {
          action: 'LOGIN',
          actorName: user.username,
          targetName: user.username,
        },
      })
      .catch((err) => {
        console.warn('[auth] Failed to write LOGIN audit log:', (err as Error).message);
      });

    const rt = await issueRefreshToken(user.id);
    issueAuthCookie(reply, token, rt);
    reply.send(
      decryptUserPii({
        id: user.id,
        username: user.username,
        email: user.email,
        realName: user.realName,
        avatarEmoji: user.avatarEmoji,
        mustChangePassword: user.mustChangePassword,
        isAdmin: user.isAdmin,
        isFoundingAdmin: user.isFoundingAdmin,
        emailVerified: user.emailVerified,
      }),
    );
  });

  // Logout: revoke the refresh token family so all related sessions are invalidated,
  // then increment tokenVersion to invalidate any outstanding JWTs immediately.
  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const rawRt = req.cookies?.refresh_token;
    if (rawRt) await revokeRefreshFamily(rawRt).catch(() => {});
    await prisma.user
      .update({
        where: { id: req.user.userId },
        data: { tokenVersion: { increment: 1 } },
      })
      .catch((err) => {
        console.warn('[auth] Failed to increment tokenVersion on logout:', (err as Error).message);
      });
    await prisma.adminLog.create({ data: { action: 'LOGOUT', actorName: req.user.username } }).catch((err) => {
      console.warn('[auth] Failed to write LOGOUT audit log:', (err as Error).message);
    });
    clearAuthCookies(reply);
    reply.send({ ok: true });
  });

  // Refresh token rotation - no session JWT required; the refresh_token cookie is the credential.
  // Issues a new 1-hour JWT + a new 30-day refresh token in the same family.
  // If a consumed token is re-presented (stolen + reused), the entire family is revoked.
  app.post('/api/auth/refresh-token', async (req, reply) => {
    const rawRt = req.cookies?.refresh_token;
    if (!rawRt) return reply.status(401).send({ error: 'No refresh token' });

    const rotated = await rotateRefreshToken(rawRt);
    if (!rotated) {
      // Reuse detected or token expired - clear cookies and force full re-login
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'Session expired, please log in again' });
    }

    const user = await prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { id: true, username: true, tokenVersion: true },
    });
    if (!user) {
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'Session expired, please log in again' });
    }

    const newJwt = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        tokenVersion: user.tokenVersion,
      },
      config.jwtSecret,
      { expiresIn: '1h' },
    );
    issueAuthCookie(reply, newJwt, rotated.raw);
    reply.send({ ok: true });
  });

  // Current user profile - called on every page load to hydrate the auth context
  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    // App Registration tokens surface the app's name as its identity, not the creator's profile
    if (req.user.appName) {
      const creator = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { username: true },
      });
      return reply.send({
        username: req.user.appName,
        isApp: true,
        createdBy: creator?.username ?? null,
      });
    }
    const [user, cfg] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          id: true,
          username: true,
          email: true,
          realName: true,
          avatarEmoji: true,
          avatarUrl: true,
          phone: true,
          emailVerified: true,
          isAdmin: true,
          isFoundingAdmin: true,
          mustChangePassword: true,
          totpEnabled: true,
          notificationPreferences: true,
          acceptsInvites: true,
        },
      }),
      getServerConfig(),
    ]);
    if (!user) return reply.status(404).send({ error: 'Not found' });
    const mustSetupMfa = cfg.requireMfa && !user.totpEnabled;
    // Decrypt PII fields (realName, phone stored AES-256-GCM) and append server-config flags the UI needs
    reply.send({
      ...decryptUserPii(user),
      announcementsEnabled: cfg.announcementsEnabled,
      mustSetupMfa,
    });
  });
}
