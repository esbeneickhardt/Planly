/**
 * Admin user management — promote, demote, unlock, force-verify, delete, crown transfer.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth';
import prisma from '../../db/client';
import { validate } from '../../utils/validate';

const transferCrownSchema = z.object({ userId: z.string() });

export async function adminUserRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, isAdmin: true, isFoundingAdmin: true, emailVerified: true, createdAt: true, failedLoginAttempts: true, loginLockedUntil: true },
      orderBy: [{ isFoundingAdmin: 'desc' }, { isAdmin: 'desc' }, { createdAt: 'asc' }],
    });
    reply.send(users);
  });

  app.put('/api/admin/users/:id/promote', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true, isFoundingAdmin: true } });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can promote users to admin.' });
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
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can demote other admins.' });
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) return reply.status(400).send({ error: 'Cannot remove the last admin' });
    await prisma.user.update({ where: { id }, data: { isAdmin: false } });
    await prisma.adminLog.create({ data: { action: 'USER_DEMOTED', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  app.put('/api/admin/transfer-crown', { preHandler: requireAdmin }, async (req, reply) => {
    const crownBody = validate(transferCrownSchema, req.body, reply);
    if (!crownBody) return;
    const { userId: targetId } = crownBody;
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

  app.put('/api/admin/users/:id/unlock', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    await prisma.user.update({ where: { id }, data: { failedLoginAttempts: 0, loginLockedUntil: null, loginLockCount: 0 } });
    await prisma.adminLog.create({ data: { action: 'LOGIN_UNLOCKED', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  app.put('/api/admin/users/:id/verify-email', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    await prisma.user.update({ where: { id }, data: { emailVerified: true } });
    await prisma.adminLog.create({ data: { action: 'EMAIL_VERIFIED_BY_ADMIN', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

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
}
