import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../middleware/auth';
import { config } from '../config/env';
import prisma from '../db/client';

export async function adminRoutes(app: FastifyInstance) {
  // ── Users ────────────────────────────────────────────────────────────────────

  app.get('/api/admin/users', { preHandler: requireAdmin }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, isAdmin: true, isFoundingAdmin: true, emailVerified: true, createdAt: true },
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

  // ── Server config (read-only) ─────────────────────────────────────────────────

  app.get('/api/admin/config', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send({
      adminEmail: config.admin.email || null,
      requireEmailVerification: config.admin.requireEmailVerification,
      requireWhitelist: config.admin.requireWhitelist,
    });
  });

  // ── Logs ──────────────────────────────────────────────────────────────────────

  app.get('/api/admin/logs', { preHandler: requireAdmin }, async (req, reply) => {
    const { limit = '50', offset = '0' } = req.query as { limit?: string; offset?: string };
    const logs = await prisma.adminLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit), 200),
      skip: parseInt(offset),
    });
    reply.send(logs);
  });
}
