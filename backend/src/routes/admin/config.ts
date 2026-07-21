/**
 * Admin server config and email whitelist routes.
 * Manages the singleton ServerConfig row and the EmailWhitelist table.
 * When email verification is toggled on, this module immediately sends verification
 * emails to all currently-unverified users if SMTP is configured.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { requireAdmin } from '../../middleware/auth';
import { config } from '../../config/env';
import prisma from '../../db/client';
import { getServerConfig } from '../../utils/server-config';
import { getSmtpSettings, sendEmail, verifyEmailTemplate } from '../../utils/email';
import { validate } from '../../utils/validate';

// Validates an email pattern (full address or @domain) and its allow/deny type
const addWhitelistSchema = z.object({ pattern: z.string().min(1), type: z.enum(['allow', 'deny']).optional() });
// Partial update shape for the singleton ServerConfig row
const serverConfigSchema = z.object({
  requireEmailVerification: z.boolean().optional(),
  requireWhitelist: z.boolean().optional(),
  requireBlocklist: z.boolean().optional(),
  allowProjectCreation: z.boolean().optional(),
  announcementsEnabled: z.boolean().optional(),
  announcementPostRole: z.string().optional(),
  requireMfa: z.boolean().optional(),
});

export async function adminConfigRoutes(app: FastifyInstance) {
  // ── Whitelist ──────────────────────────────────────────────────────────────

  // Return all email allow/deny patterns in insertion order
  app.get('/api/admin/whitelist', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send(await prisma.emailWhitelist.findMany({ orderBy: { createdAt: 'asc' } }));
  });

  // Add an email allow or deny pattern to the list
  app.post('/api/admin/whitelist', { preHandler: requireAdmin }, async (req, reply) => {
    const wlBody = validate(addWhitelistSchema, req.body, reply);
    if (!wlBody) return;
    const p = wlBody.pattern.trim().toLowerCase();
    if (!p.startsWith('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) {
      return reply.status(400).send({ error: 'Pattern must be an email address or a domain starting with @ (e.g. @company.com)' });
    }
    const type = wlBody.type ?? 'allow';
    try {
      const entry = await prisma.emailWhitelist.create({ data: { pattern: p, type } });
      reply.status(201).send(entry);
    } catch {
      reply.status(409).send({ error: 'Pattern already exists' });
    }
  });

  // Remove an email list entry by ID
  app.delete('/api/admin/whitelist/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.emailWhitelist.deleteMany({ where: { id } });
    reply.send({ ok: true });
  });

  // ── Server config ──────────────────────────────────────────────────────────

  // Return the current server configuration including admin email from env
  app.get('/api/admin/server-config', { preHandler: requireAdmin }, async (_req, reply) => {
    const cfg = await getServerConfig();
    reply.send({ adminEmail: config.admin.email || null, ...cfg });
  });

  // Update server configuration; toggling on requireEmailVerification triggers bulk verification emails
  app.put('/api/admin/server-config', { preHandler: requireAdmin }, async (req, reply) => {
    const cfgBody = validate(serverConfigSchema, req.body, reply);
    if (!cfgBody) return;
    const { requireEmailVerification, requireWhitelist, requireBlocklist, allowProjectCreation, announcementsEnabled, announcementPostRole, requireMfa } = cfgBody;
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });

    // Snapshot the config before the update so we can detect transitions (e.g. verification just turned on)
    const prevConfig = await getServerConfig();

    // Upsert only the fields present in the request body; omit undefined fields to avoid overwriting with nulls
    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      update: {
        ...(requireEmailVerification !== undefined ? { requireEmailVerification } : {}),
        ...(requireWhitelist !== undefined ? { requireWhitelist } : {}),
        ...(requireBlocklist !== undefined ? { requireBlocklist } : {}),
        ...(allowProjectCreation !== undefined ? { allowProjectCreation } : {}),
        ...(announcementsEnabled !== undefined ? { announcementsEnabled } : {}),
        ...(announcementPostRole !== undefined ? { announcementPostRole } : {}),
        ...(requireMfa !== undefined ? { requireMfa } : {}),
      },
      create: { id: 'main', requireEmailVerification: requireEmailVerification ?? false, requireWhitelist: requireWhitelist ?? false, requireBlocklist: requireBlocklist ?? false, allowProjectCreation: allowProjectCreation ?? false, announcementsEnabled: announcementsEnabled ?? false, announcementPostRole: announcementPostRole ?? 'admin', requireMfa: requireMfa ?? false },
    });
    await prisma.adminLog.create({
      data: { action: 'SERVER_CONFIG_UPDATED', actorName: actor?.username, metadata: { requireEmailVerification, requireWhitelist, allowProjectCreation, announcementsEnabled, announcementPostRole, requireMfa } },
    });

    // Bulk-send verification emails when the feature is toggled on for the first time
    let verificationEmailsSent = 0;
    if (requireEmailVerification === true && !prevConfig.requireEmailVerification) {
      const smtp = await getSmtpSettings();
      if (smtp) {
        const unverified = await prisma.user.findMany({ where: { emailVerified: false }, select: { id: true, email: true, username: true } });
        req.log.info(`[email-verification] Sending verification emails to ${unverified.length} unverified user(s)`);
        const results = await Promise.allSettled(unverified.map(async (u) => {
          // Store only the hash; the raw token goes in the email link
          const raw = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(raw).digest('hex');
          await prisma.emailVerifyToken.create({ data: { userId: u.id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
          await sendEmail({ to: u.email, subject: 'Verify your Planly email', html: verifyEmailTemplate(`${config.appUrl}/verify-email?token=${raw}`, u.username) });
        }));
        verificationEmailsSent = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) req.log.error({ errors: failed.map((r) => (r as PromiseRejectedResult).reason) }, `[email-verification] ${failed.length} failed`);
      } else {
        req.log.warn('[email-verification] Email not configured - skipping bulk verification send');
      }
    }

    const updatedConfig = await getServerConfig();
    reply.send({ ok: true, verificationEmailsSent, ...updatedConfig });
  });
}
