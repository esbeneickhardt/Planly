/**
 * Admin server config and email whitelist routes.
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

const addWhitelistSchema = z.object({ pattern: z.string().min(1) });
const serverConfigSchema = z.object({
  requireEmailVerification: z.boolean().optional(),
  requireWhitelist: z.boolean().optional(),
  allowProjectCreation: z.boolean().optional(),
  announcementsEnabled: z.boolean().optional(),
  announcementPostRole: z.string().optional(),
});

export async function adminConfigRoutes(app: FastifyInstance) {
  // ── Whitelist ──────────────────────────────────────────────────────────────

  app.get('/api/admin/whitelist', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send(await prisma.emailWhitelist.findMany({ orderBy: { createdAt: 'asc' } }));
  });

  app.post('/api/admin/whitelist', { preHandler: requireAdmin }, async (req, reply) => {
    const wlBody = validate(addWhitelistSchema, req.body, reply);
    if (!wlBody) return;
    const p = wlBody.pattern.trim().toLowerCase();
    if (!p.startsWith('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) {
      return reply.status(400).send({ error: 'Pattern must be an email address or a domain starting with @ (e.g. @company.com)' });
    }
    try {
      const entry = await prisma.emailWhitelist.create({ data: { pattern: p } });
      reply.status(201).send(entry);
    } catch {
      reply.status(409).send({ error: 'Pattern already exists' });
    }
  });

  app.delete('/api/admin/whitelist/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.emailWhitelist.deleteMany({ where: { id } });
    reply.send({ ok: true });
  });

  // ── Server config ──────────────────────────────────────────────────────────

  app.get('/api/admin/server-config', { preHandler: requireAdmin }, async (_req, reply) => {
    const cfg = await getServerConfig();
    reply.send({ adminEmail: config.admin.email || null, ...cfg });
  });

  app.put('/api/admin/server-config', { preHandler: requireAdmin }, async (req, reply) => {
    const cfgBody = validate(serverConfigSchema, req.body, reply);
    if (!cfgBody) return;
    const { requireEmailVerification, requireWhitelist, allowProjectCreation, announcementsEnabled, announcementPostRole } = cfgBody;
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const prevConfig = await getServerConfig();

    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      update: {
        ...(requireEmailVerification !== undefined ? { requireEmailVerification } : {}),
        ...(requireWhitelist !== undefined ? { requireWhitelist } : {}),
        ...(allowProjectCreation !== undefined ? { allowProjectCreation } : {}),
        ...(announcementsEnabled !== undefined ? { announcementsEnabled } : {}),
        ...(announcementPostRole !== undefined ? { announcementPostRole } : {}),
      },
      create: { id: 'main', requireEmailVerification: requireEmailVerification ?? false, requireWhitelist: requireWhitelist ?? false, allowProjectCreation: allowProjectCreation ?? false, announcementsEnabled: announcementsEnabled ?? false, announcementPostRole: announcementPostRole ?? 'admin' },
    });
    await prisma.adminLog.create({
      data: { action: 'SERVER_CONFIG_UPDATED', actorName: actor?.username, metadata: { requireEmailVerification, requireWhitelist, allowProjectCreation, announcementsEnabled, announcementPostRole } },
    });

    let verificationEmailsSent = 0;
    if (requireEmailVerification === true && !prevConfig.requireEmailVerification) {
      const smtp = await getSmtpSettings();
      if (smtp) {
        const unverified = await prisma.user.findMany({ where: { emailVerified: false }, select: { id: true, email: true, username: true } });
        req.log.info(`[email-verification] Sending verification emails to ${unverified.length} unverified user(s)`);
        const results = await Promise.allSettled(unverified.map(async (u) => {
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

    reply.send({ ok: true, verificationEmailsSent });
  });
}
