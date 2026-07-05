import { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getSmtpSettings, sendEmail } from '../utils/email';
import { encryptValue } from '../utils/crypto';
import prisma from '../db/client';

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
        ? { host: settings.host, port: settings.port, secure: settings.secure, user: settings.user, from: settings.from }
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
    const { host, port, secure, user, pass, from } = req.body as {
      host: string; port: number; secure: boolean; user: string; pass?: string; from: string;
    };
    if (!host?.trim()) return reply.status(400).send({ error: 'host required' });
    if (!from?.trim()) return reply.status(400).send({ error: 'from required' });

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
        data: { id: 'default', host: host.trim(), port: port ?? 587, secure: secure ?? false, user: user ?? '', pass: encryptValue(pass), from: from.trim() },
      });
    }
    reply.send({ ok: true });
  });

  // Clear saved SMTP config (revert to env vars)
  app.delete('/api/email-config', { preHandler: requireAdmin }, async (_req, reply) => {
    await prisma.smtpConfig.deleteMany({ where: { id: 'default' } });
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
