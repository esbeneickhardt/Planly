import { FastifyInstance } from 'fastify';
import { Readable } from 'stream';
import { randomBytes, createHash } from 'crypto';
import { requireAdmin } from '../middleware/auth';
import { config } from '../config/env';
import prisma from '../db/client';
import { getServerConfig } from '../utils/server-config';
import { getSmtpSettings, sendEmail, verifyEmailTemplate } from '../utils/email';

function buildLogWhere(action?: string, from?: string, to?: string) {
  return {
    ...(action ? { action } : {}),
    ...((from || to) ? { createdAt: {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }} : {}),
  };
}

export async function adminRoutes(app: FastifyInstance) {
  // ── Users ────────────────────────────────────────────────────────────────────

  app.get('/api/admin/users', { preHandler: requireAdmin }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, isAdmin: true, isFoundingAdmin: true, emailVerified: true, createdAt: true, failedLoginAttempts: true, loginLockedUntil: true },
      orderBy: [{ isFoundingAdmin: 'desc' }, { isAdmin: 'desc' }, { createdAt: 'asc' }],
    });
    reply.send(users);
  });

  app.put('/api/admin/users/:id/promote', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true, email: true, isAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.isAdmin) return reply.status(400).send({ error: 'User is already an admin' });
    await prisma.user.update({ where: { id }, data: { isAdmin: true } });
    await prisma.adminLog.create({ data: { action: 'USER_PROMOTED', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  app.put('/api/admin/users/:id/demote', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true, isFoundingAdmin: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true, isAdmin: true, isFoundingAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (!target.isAdmin) return reply.status(400).send({ error: 'User is not an admin' });
    if (target.isFoundingAdmin) return reply.status(403).send({ error: 'The founding admin cannot be demoted. Use "Transfer crown" first.' });
    // Only the founding admin can demote other admins
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can demote other admins.' });
    // Last-admin protection
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) return reply.status(400).send({ error: 'Cannot remove the last admin' });
    await prisma.user.update({ where: { id }, data: { isAdmin: false } });
    await prisma.adminLog.create({ data: { action: 'USER_DEMOTED', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // Transfer founding-admin crown to another admin
  app.put('/api/admin/transfer-crown', { preHandler: requireAdmin }, async (req, reply) => {
    const { userId: targetId } = req.body as { userId: string };
    const actorId = req.user.userId;

    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { username: true, isFoundingAdmin: true } });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the current founding admin can transfer the crown.' });

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { username: true, isAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (!target.isAdmin) return reply.status(400).send({ error: 'Target must be an admin before receiving the crown.' });
    if (targetId === actorId) return reply.status(400).send({ error: 'You already hold the crown.' });

    await prisma.$transaction([
      prisma.user.update({ where: { id: actorId }, data: { isFoundingAdmin: false } }),
      prisma.user.update({ where: { id: targetId }, data: { isFoundingAdmin: true } }),
    ]);
    await prisma.adminLog.create({ data: { action: 'CROWN_TRANSFERRED', actorName: actor.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // Unlock a locked-out account
  app.put('/api/admin/users/:id/unlock', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    await prisma.user.update({ where: { id }, data: { failedLoginAttempts: 0, loginLockedUntil: null } });
    await prisma.adminLog.create({ data: { action: 'LOGIN_UNLOCKED', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // Force-verify a user's email (admin convenience)
  app.put('/api/admin/users/:id/verify-email', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    await prisma.user.update({ where: { id }, data: { emailVerified: true } });
    await prisma.adminLog.create({ data: { action: 'EMAIL_VERIFIED_BY_ADMIN', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // Delete a user account (admin)
  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.user.userId) return reply.status(400).send({ error: 'Cannot delete your own account via admin panel.' });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true, isFoundingAdmin: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true, isFoundingAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.isFoundingAdmin) return reply.status(403).send({ error: 'Cannot delete the founding admin.' });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can delete users.' });
    await prisma.user.delete({ where: { id } });
    await prisma.adminLog.create({ data: { action: 'USER_DELETED', actorName: actor.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // ── Whitelist ─────────────────────────────────────────────────────────────────

  app.get('/api/admin/whitelist', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send(await prisma.emailWhitelist.findMany({ orderBy: { createdAt: 'asc' } }));
  });

  app.post('/api/admin/whitelist', { preHandler: requireAdmin }, async (req, reply) => {
    const { pattern } = req.body as { pattern: string };
    if (!pattern?.trim()) return reply.status(400).send({ error: 'Pattern required' });
    const p = pattern.trim().toLowerCase();
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

  // ── Server config (editable in-app) ──────────────────────────────────────────

  app.get('/api/admin/server-config', { preHandler: requireAdmin }, async (_req, reply) => {
    const cfg = await getServerConfig();
    reply.send({
      adminEmail: config.admin.email || null,
      ...cfg,
    });
  });

  app.put('/api/admin/server-config', { preHandler: requireAdmin }, async (req, reply) => {
    const { requireEmailVerification, requireWhitelist } = req.body as {
      requireEmailVerification?: boolean;
      requireWhitelist?: boolean;
    };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });

    const prevConfig = await getServerConfig();

    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      update: {
        ...(requireEmailVerification !== undefined ? { requireEmailVerification } : {}),
        ...(requireWhitelist !== undefined ? { requireWhitelist } : {}),
      },
      create: {
        id: 'main',
        requireEmailVerification: requireEmailVerification ?? false,
        requireWhitelist: requireWhitelist ?? false,
      },
    });
    await prisma.adminLog.create({
      data: { action: 'SERVER_CONFIG_UPDATED', actorName: actor?.username, metadata: { requireEmailVerification, requireWhitelist } },
    });

    // When turning email verification ON: email everyone who has never verified
    // Already-verified users are unaffected - verification is a permanent record of a confirmed address
    let verificationEmailsSent = 0;
    if (requireEmailVerification === true && !prevConfig.requireEmailVerification) {
      const smtp = await getSmtpSettings();
      if (smtp) {
        const unverified = await prisma.user.findMany({ where: { emailVerified: false }, select: { id: true, email: true, username: true } });
        console.log(`[email-verification] Sending verification emails to ${unverified.length} unverified user(s)`);
        const results = await Promise.allSettled(unverified.map(async (u) => {
          const raw = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(raw).digest('hex');
          await prisma.emailVerifyToken.create({ data: { userId: u.id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
          await sendEmail({ to: u.email, subject: 'Verify your Planly email', html: verifyEmailTemplate(`${config.appUrl}/verify-email?token=${raw}`, u.username) });
          console.log(`[email-verification] Sent to ${u.email}`);
        }));
        verificationEmailsSent = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) console.error(`[email-verification] ${failed.length} failed:`, failed.map(r => (r as PromiseRejectedResult).reason));
      } else {
        console.warn('[email-verification] Email not configured - skipping bulk verification send');
      }
    }

    reply.send({ ok: true, verificationEmailsSent });
  });

  // ── Projects (server-wide) ────────────────────────────────────────────────────

  app.get('/api/admin/projects', { preHandler: requireAdmin }, async (_req, reply) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, emoji: true, deadline: true, createdAt: true,
        ownerUser: { select: { username: true, avatarEmoji: true } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        team: { select: { _count: { select: { members: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(products.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      deadline: p.deadline,
      createdAt: p.createdAt,
      ownerUsername: p.ownerUser?.username ?? null,
      ownerEmoji: p.ownerUser?.avatarEmoji ?? null,
      memberCount: p.team._count.members,
      taskCount: p._count.tasks,
    })));
  });

  // ── Statistics ─────────────────────────────────────────────────────────────────

  app.get('/api/admin/stats', { preHandler: requireAdmin }, async (_req, reply) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [userCount, projectCount, taskCount, messageCount, newUsers, newProjects] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.task.count({ where: { deletedAt: null } }),
      prisma.message.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.product.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
    ]);
    reply.send({ userCount, projectCount, taskCount, messageCount, newUsers, newProjects });
  });

  // ── Logs ──────────────────────────────────────────────────────────────────────

  app.get('/api/admin/logs', { preHandler: requireAdmin }, async (req, reply) => {
    const { limit = '50', cursor, action, from, to } = req.query as {
      limit?: string; cursor?: string; action?: string; from?: string; to?: string;
    };
    const take = Math.min(parseInt(limit) || 50, 200);
    const where = buildLogWhere(action, from, to);
    const logs = await prisma.adminLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    reply.send({ logs, nextCursor: logs.length === take ? logs[logs.length - 1].id : null });
  });

  app.get('/api/admin/logs/export', { preHandler: requireAdmin }, async (req, reply) => {
    const { format = 'csv', action, from, to } = req.query as {
      format?: string; action?: string; from?: string; to?: string;
    };
    const fmt = format === 'jsonl' ? 'jsonl' : 'csv';
    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${fmt}`;
    const where = buildLogWhere(action, from, to);

    reply.header('Content-Type', fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    const readable = new Readable({ read() {} });
    reply.send(readable);

    if (fmt === 'csv') {
      readable.push('id,action,actorId,actorName,targetId,targetName,createdAt,metadata\n');
    }

    let batchCursor: string | undefined;
    const BATCH = 1000;
    while (true) {
      const batch = await prisma.adminLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: BATCH,
        ...(batchCursor ? { cursor: { id: batchCursor }, skip: 1 } : {}),
      });
      for (const row of batch) {
        if (fmt === 'csv') {
          const meta = row.metadata ? JSON.stringify(row.metadata).replace(/"/g, '""') : '';
          readable.push(`"${row.id}","${row.action}","${row.actorId ?? ''}","${row.actorName ?? ''}","${row.targetId ?? ''}","${row.targetName ?? ''}","${row.createdAt.toISOString()}","${meta}"\n`);
        } else {
          readable.push(JSON.stringify(row) + '\n');
        }
      }
      if (batch.length < BATCH) break;
      batchCursor = batch[batch.length - 1].id;
    }
    readable.push(null);
  });

  app.delete('/api/admin/logs/prune', { preHandler: requireAdmin }, async (req, reply) => {
    const { olderThanDays } = req.body as { olderThanDays: number };
    const days = Math.max(1, parseInt(String(olderThanDays)) || 90);
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true, isFoundingAdmin: true } });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can prune logs.' });
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.adminLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await prisma.adminLog.create({ data: { action: 'LOGS_PRUNED', actorName: actor.username, metadata: { olderThanDays: days, deletedCount: count, cutoff } } });
    reply.send({ ok: true, deletedCount: count });
  });
}
