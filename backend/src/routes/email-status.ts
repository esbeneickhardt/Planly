/**
 * Email/SMTP admin routes - manage the SMTP configuration via the Admin UI.
 *
 * Provides endpoints to read, upsert, test, and delete the SMTP configuration.
 * The SMTP password is stored AES-256-GCM encrypted. The test endpoint sends a
 * real email to the admin's address to verify the configuration is working.
 * DB-stored SMTP config takes precedence over environment variables at send time.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getSmtpSettings, sendEmail, invalidateSmtpCache } from '../utils/email';
import { encryptValue } from '../utils/crypto';
import { validate } from '../utils/validate';
import prisma from '../db/client';

// Schema for creating or replacing the SMTP configuration
const upsertSmtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  pass: z.string().optional(),
  from: z.string().min(1),
});

export async function emailStatusRoutes(app: FastifyInstance) {
  // Returns SMTP enabled status; admins also get the full config (password never returned)
  app.get('/api/email-status', { preHandler: requireAuth }, async (req, reply) => {
    const [settings, user] = await Promise.all([
      getSmtpSettings(),
      prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } }),
    ]);
    if (!user?.isAdmin) {
      return reply.send({ enabled: !!settings });
    }
    reply.send({
      enabled: !!settings,
      from: settings?.from ?? null,
      config: settings
        ? {
            host: settings.host,
            port: settings.port,
            secure: settings.secure,
            user: settings.user,
            from: settings.from,
          }
        : null,
    });
  });

  // Returns the raw saved DB config (for pre-filling the form)
  app.get('/api/email-config', { preHandler: requireAdmin }, async (_req, reply) => {
    const row = await prisma.smtpConfig.findUnique({ where: { id: 'default' } });
    if (!row) return reply.send(null);
    // Never return the password
    reply.send({ host: row.host, port: row.port, secure: row.secure, user: row.user, from: row.from });
  });

  // Save (upsert) SMTP config
  app.put('/api/email-config', { preHandler: requireAdmin }, async (req, reply) => {
    const body = validate(upsertSmtpSchema, req.body, reply);
    if (!body) return;
    const { host, port, secure, user, pass, from } = body;

    // Update or create depending on whether a config record already exists
    const existing = await prisma.smtpConfig.findUnique({ where: { id: 'default' } });

    if (existing) {
      await prisma.smtpConfig.update({
        where: { id: 'default' },
        data: {
          host: host.trim(),
          port: port ?? 587,
          secure: secure ?? false,
          user: user ?? '',
          // Only update password if a new one was provided; encrypt before storing
          ...(pass ? { pass: encryptValue(pass) } : {}),
          from: from.trim(),
        },
      });
    } else {
      if (!pass) return reply.status(400).send({ error: 'password required for initial setup' });
      await prisma.smtpConfig.create({
        data: {
          id: 'default',
          host: host.trim(),
          port: port ?? 587,
          secure: secure ?? false,
          user: user ?? '',
          pass: encryptValue(pass),
          from: from.trim(),
        },
      });
    }
    invalidateSmtpCache();
    reply.send({ ok: true });
  });

  // Clear saved SMTP config (revert to env vars)
  app.delete('/api/email-config', { preHandler: requireAdmin }, async (_req, reply) => {
    await prisma.smtpConfig.deleteMany({ where: { id: 'default' } });
    invalidateSmtpCache();
    reply.send({ ok: true });
  });

  // Send a test email to the current user
  app.post('/api/email-status/test', { preHandler: requireAuth }, async (req, reply) => {
    const settings = await getSmtpSettings();
    if (!settings) return reply.status(400).send({ error: 'SMTP not configured' });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    try {
      await sendEmail({
        to: user.email,
        subject: 'Planly - email test',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 16px">Email is working ✓</h2>
          <p>Hi ${user.username},</p>
          <p>This is a test email from Planly. Your email configuration is working correctly.</p>
          <p style="color:#aaa;font-size:12px;margin-top:24px">Sent from: ${settings.from}</p>
        </div>`,
      });
      reply.send({ ok: true });
    } catch (err) {
      app.log.error(err, 'SMTP test email failed');
      reply.status(500).send({ error: 'Failed to send test email. Check server logs.' });
    }
  });
}
