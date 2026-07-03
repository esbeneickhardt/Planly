import { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../db/client';
import { config } from '../config/env';
import { sendEmail, emailEnabled, getSmtpSettings, resetPasswordEmail, verifyEmailTemplate } from '../utils/email';
import { requireAuth } from '../middleware/auth';

export async function passwordResetRoutes(app: FastifyInstance) {
  // Report whether email features are available
  app.get('/api/auth/email-enabled', async (_req, reply) => {
    reply.send({ enabled: emailEnabled });
  });

  // Request password reset - sends email with link
  app.post('/api/auth/forgot-password', async (req, reply) => {
    if (!emailEnabled) {
      return reply.status(503).send({ error: 'Email is not configured on this server. Ask your administrator to set up SMTP.' });
    }
    const { email } = req.body as { email?: string };
    if (!email) return reply.status(400).send({ error: 'email required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Always respond OK to avoid user enumeration
    if (!user) return reply.send({ ok: true });

    // Invalidate existing unused tokens
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${config.appUrl}/reset-password?token=${raw}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset your Planly password',
      html: resetPasswordEmail(resetUrl, user.username),
    });

    reply.send({ ok: true });
  });

  // Complete password reset
  app.post('/api/auth/reset-password', async (req, reply) => {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) return reply.status(400).send({ error: 'token and password required' });
    if (password.length < 8) return reply.status(400).send({ error: 'Password must be at least 8 characters' });

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired reset link' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    reply.send({ ok: true });
  });

  // Public resend - for users who got logged out before they could verify (no auth required)
  app.post('/api/auth/resend-verification', async (req, reply) => {
    const { email } = req.body as { email?: string };
    if (!email) return reply.status(400).send({ error: 'email required' });
    const smtpSettings = await getSmtpSettings();
    if (!smtpSettings) return reply.status(503).send({ error: 'Email is not configured on this server.' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Always respond OK to avoid user enumeration
    if (!user || user.emailVerified) return reply.send({ ok: true });

    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await prisma.emailVerifyToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    await sendEmail({
      to: user.email,
      subject: 'Verify your Planly email',
      html: verifyEmailTemplate(`${config.appUrl}/verify-email?token=${raw}`, user.username),
    });
    reply.send({ ok: true });
  });

  // Request email verification (requires login)
  app.post('/api/auth/send-verification', { preHandler: requireAuth }, async (req, reply) => {
    const smtpSettings = await getSmtpSettings();
    if (!smtpSettings) {
      return reply.status(503).send({ error: 'Email is not configured on this server.' });
    }
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    if (user.emailVerified) return reply.send({ ok: true, alreadyVerified: true });

    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.emailVerifyToken.create({ data: { userId, tokenHash, expiresAt } });

    const verifyUrl = `${config.appUrl}/verify-email?token=${raw}`;
    await sendEmail({
      to: user.email,
      subject: 'Verify your Planly email',
      html: verifyEmailTemplate(verifyUrl, user.username),
    });

    reply.send({ ok: true });
  });

  // Change password while logged in (also clears mustChangePassword flag)
  app.post('/api/auth/change-password', { preHandler: requireAuth }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!newPassword || newPassword.length < 8) return reply.status(400).send({ error: 'New password must be at least 8 characters' });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return reply.status(404).send({ error: 'Not found' });
    if (!user.passwordHash) return reply.status(400).send({ error: 'This account uses SSO - password cannot be changed here.' });
    // If mustChangePassword is set, skip current-password check (they can't know it)
    if (!user.mustChangePassword) {
      if (!currentPassword) return reply.status(400).send({ error: 'Current password required' });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.status(401).send({ error: 'Current password is incorrect' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    reply.send({ ok: true });
  });

  // Verify email
  app.post('/api/auth/verify-email', async (req, reply) => {
    const { token } = req.body as { token?: string };
    if (!token) return reply.status(400).send({ error: 'token required' });

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await prisma.emailVerifyToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired verification link' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      prisma.emailVerifyToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    reply.send({ ok: true });
  });
}
