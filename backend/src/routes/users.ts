/**
 * User routes - registration, profile management (including public profile visibility),
 * notification preferences, and self-deletion.
 *
 * Registration (POST /api/users) creates the account, enforces the server's email
 * allow/block-list rules, and - when the server requires email verification - sends the
 * first verification link. The endpoints that actually verify or resend that link
 * (POST /api/auth/verify-email, /resend-verification, /send-verification) live in
 * password-reset.ts, not here.
 *
 * Sensitive PII fields (realName, phone) are stored AES-256-GCM encrypted and decrypted
 * before being sent to the client. A user's project list is exposed on their public profile
 * (GET /api/users/:id/profile) only when that user's showProjectsOnProfile setting is true
 * (the default) or the caller is viewing their own profile; the response's `projectsVisible`
 * flag tells the frontend whether an empty `projects` array means "no projects" or "hidden by
 * privacy setting". Self-deletion is audit-logged and permanently removes the user from all
 * teams.
 */
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { handleNotFound, handleConflict } from '../utils/prisma-errors';
import { config } from '../config/env';
import { sendEmail } from '../utils/email';
import { getServerConfig } from '../utils/server-config';
import { z } from 'zod';
import { validate } from '../utils/validate';
import { registerSchema } from '../schemas/auth';
import { encryptOptional, decryptUserPii } from '../utils/crypto';
import { logAdminEvent } from '../utils/audit';

// Partial profile update: PII fields are encrypted by encryptOptional before writing
const updateProfileSchema = z.object({
  realName: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  avatarEmoji: z.string().max(8).optional(),
  // Set exclusively via AvatarPicker's upload flow, which always produces this exact shape
  // (see /api/upload in messages.ts) - not a free-form URL field.
  avatarUrl: z
    .string()
    .max(2048)
    .regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/)
    .nullable()
    .optional(),
  acceptsInvites: z.boolean().optional(),
  showProjectsOnProfile: z.boolean().optional(),
});
// Notification preferences are stored as a JSON blob; keys are preference names, values are booleans
const updatePreferencesSchema = z.object({
  preferences: z.record(z.string().max(100), z.boolean()),
});

// Full self-profile fields returned for the authenticated user - never exposes passwordHash
const USER_SELF_SELECT = {
  id: true,
  username: true,
  email: true,
  realName: true,
  avatarEmoji: true,
  avatarUrl: true,
  phone: true,
  createdAt: true,
  emailVerified: true,
  notificationPreferences: true,
  acceptsInvites: true,
  showProjectsOnProfile: true,
};
// Minimal public profile for team member search - no email, phone, or createdAt
const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  realName: true,
  avatarEmoji: true,
  acceptsInvites: true,
  isAdmin: true,
};

export async function userRoutes(app: FastifyInstance) {
  // Global user search: minimal fields only (used for team member lookup)
  app.get('/api/users', { preHandler: requireAuth }, async (req, reply) => {
    const { cursor, limit = '200' } = req.query as { cursor?: string; limit?: string };
    const take = Math.min(parseInt(limit) || 200, 500);
    const users = await prisma.user.findMany({
      select: USER_PUBLIC_SELECT,
      // A scoped token only ever needs its own project's teammates (e.g. an @mention picker),
      // not a directory of every account on the server.
      where: req.user.scopedProductId
        ? { teams: { some: { team: { products: { some: { id: req.user.scopedProductId } } } } } }
        : undefined,
      orderBy: { username: 'asc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const nextCursor = users.length === take ? (users[users.length - 1]?.id ?? null) : null;
    reply.send({ users: users.map(decryptUserPii), nextCursor });
  });

  // Registration - public endpoint with tighter rate limit
  const registerRateMax = parseInt(process.env.RATE_LIMIT_REGISTER_MAX ?? '10', 10);
  app.post(
    '/api/users',
    { config: { rateLimit: { max: registerRateMax, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const parsed = validate(registerSchema, req.body, reply);
      if (!parsed) return;
      const { username, email: normalizedEmail, password, realName, phone, avatarEmoji } = parsed;
      const tosAcceptedAt = new Date();

      const serverConfig = await getServerConfig();

      // Email access rules: each list only enforced when its toggle is on
      if (serverConfig.requireBlocklist || serverConfig.requireWhitelist) {
        const emailRules = await prisma.emailWhitelist.findMany();
        const matches = (pattern: string) =>
          pattern.startsWith('@') ? normalizedEmail.endsWith(pattern) : normalizedEmail === pattern;
        if (serverConfig.requireBlocklist) {
          const isDenied = emailRules.filter((r) => r.type === 'deny').some((r) => matches(r.pattern));
          if (isDenied) {
            return reply
              .status(403)
              .send({ error: 'This email address is not permitted to register. Contact the server administrator.' });
          }
        }
        if (serverConfig.requireWhitelist) {
          const isAllowed = emailRules.filter((r) => r.type === 'allow').some((r) => matches(r.pattern));
          if (!isAllowed) {
            return reply
              .status(403)
              .send({ error: 'This email address is not on the allowed list. Contact the server administrator.' });
          }
        }
      }

      // Case-insensitive username uniqueness check (DB unique index is case-sensitive)
      const existingUsername = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
      });
      if (existingUsername) return reply.status(409).send({ error: 'Username already taken' });

      // Hash password and create the user record (409 on duplicate email)
      const passwordHash = await bcrypt.hash(password, 12);
      let user: {
        id: string;
        username: string;
        email: string;
        realName: string | null;
        avatarEmoji: string | null;
        avatarUrl: string | null;
        phone: string | null;
        createdAt: Date;
        emailVerified: boolean;
      };
      try {
        user = await prisma.user.create({
          data: {
            username: username.trim(),
            email: normalizedEmail,
            passwordHash,
            realName: encryptOptional(realName?.trim()),
            phone: encryptOptional(phone?.trim()),
            avatarEmoji,
            emailVerified: false,
            tosAcceptedAt,
            tosVersion: '1.0',
          },
          select: USER_SELF_SELECT,
        });
      } catch (e) {
        return handleConflict(e, reply, 'Username or email already taken');
      }

      // Send verification email when verification is enforced (user must click link before logging in)
      if (serverConfig.requireEmailVerification) {
        try {
          const rawToken = randomBytes(32).toString('hex');
          const { createHash } = await import('crypto');
          const tokenHash = createHash('sha256').update(rawToken).digest('hex');
          await prisma.emailVerifyToken.create({
            data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          });
          const verifyUrl = `${config.appUrl}/verify-email?token=${rawToken}`;
          await sendEmail({
            to: user.email,
            subject: 'Verify your Planly email address',
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 16px">Verify your email</h2>
            <p>Hi ${user.username.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')},</p>
            <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
            <p style="margin:24px 0"><a href="${verifyUrl}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify email →</a></p>
            <p style="color:#aaa;font-size:12px">If you didn't create a Planly account, you can ignore this email.</p>
          </div>`,
          });
        } catch {
          // Non-fatal - user can request a new link later
        }
      }

      await prisma.adminLog.create({
        data: { action: 'USER_REGISTERED', actorName: user.username, targetName: user.username },
      });
      reply.status(201).send(decryptUserPii(user));
    },
  );

  // Public user profile - display info, plus the target's own project list ONLY when the target
  // has opted into showing it (showProjectsOnProfile, default on) or the caller is viewing their
  // own profile. `projectsVisible` tells the frontend whether an empty `projects` array means "no
  // projects" or "hidden by the user's own privacy setting", so the two aren't shown identically.
  app.get('/api/users/:id/profile', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const isSelf = id === req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, realName: true, avatarEmoji: true, showProjectsOnProfile: true },
    });
    if (!user) return reply.status(404).send({ error: 'Not found' });

    const projectsVisible = isSelf || user.showProjectsOnProfile;
    let projects: { id: string; name: string; emoji: string | null; role: string }[] = [];
    if (projectsVisible) {
      // Only the teams the target user belongs to - a caller with no relationship to the target
      // still only sees the target's OWN membership list, never anything scoped to the caller.
      const targetMemberships = await prisma.teamMember.findMany({
        where: { userId: id },
        select: { teamId: true, role: true },
      });
      const targetTeamMap = Object.fromEntries(targetMemberships.map((m) => [m.teamId, m.role]));

      const products = await prisma.product.findMany({
        where: { deletedAt: null, teamId: { in: Object.keys(targetTeamMap) } },
        select: { id: true, name: true, emoji: true, ownerId: true, teamId: true },
        orderBy: { createdAt: 'asc' },
      });

      projects = products.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        role: p.ownerId === id ? 'owner' : (targetTeamMap[p.teamId] ?? 'member'),
      }));
    }

    reply.send({
      ...decryptUserPii({ id: user.id, username: user.username, realName: user.realName, avatarEmoji: user.avatarEmoji }),
      projects,
      projectsVisible,
    });
  });

  // Get own profile (full fields) or another user's public profile
  app.get('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const isSelf = id === req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id },
      select: isSelf ? USER_SELF_SELECT : USER_PUBLIC_SELECT,
    });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    reply.send(isSelf ? decryptUserPii(user as Parameters<typeof decryptUserPii>[0]) : user);
  });

  // Update own profile only
  app.patch('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    const profileBody = validate(updateProfileSchema, req.body, reply);
    if (!profileBody) return;
    const { realName, phone, avatarEmoji, avatarUrl, acceptsInvites, showProjectsOnProfile } = profileBody;
    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          realName: encryptOptional(realName),
          phone: encryptOptional(phone),
          avatarEmoji,
          avatarUrl,
          acceptsInvites,
          showProjectsOnProfile,
        },
        select: USER_SELF_SELECT,
      });
      reply.send(decryptUserPii(user));
    } catch (e) {
      handleNotFound(e, reply);
    }
  });

  // Update notification preferences
  app.patch('/api/users/:id/notification-preferences', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    const prefBody = validate(updatePreferencesSchema, req.body, reply);
    if (!prefBody) return;
    const { preferences } = prefBody;
    if (Object.keys(preferences).length > 50)
      return reply.status(400).send({ error: 'Too many preference keys (max 50)' });
    try {
      const user = await prisma.user.update({
        where: { id },
        data: { notificationPreferences: preferences },
        select: { notificationPreferences: true },
      });
      reply.send(user);
    } catch (e) {
      handleNotFound(e, reply);
    }
  });

  // Delete own account only
  app.delete('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    try {
      await prisma.user.delete({ where: { id } });
      logAdminEvent('USER_SELF_DELETED', { actorName: req.user.username, targetName: req.user.username });
      reply.send({ ok: true });
    } catch (e) {
      handleNotFound(e, reply);
    }
  });
}
