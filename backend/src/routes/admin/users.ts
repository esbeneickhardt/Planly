/**
 * Admin user management routes - promote, demote, unlock, force-verify, delete, and crown transfer.
 * Most destructive operations (promote, demote, delete, crown transfer) are gated to the
 * founding admin; regular admins can only unlock and force-verify.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { requireAdmin } from '../../middleware/auth';
import prisma from '../../db/client';
import { validate } from '../../utils/validate';
import { sendSecurityAlert } from '../../utils/security-alert';

// Validates the target userId for the crown transfer (founding admin handoff)
const transferCrownSchema = z.object({ userId: z.string() });
// Validates the isAdmin toggle for general admin status updates
const updateUserSchema = z.object({ isAdmin: z.boolean() });

export async function adminUserRoutes(app: FastifyInstance) {
  // Return all users ordered by admin status then creation date (for the admin user table)
  app.get('/api/admin/users', { preHandler: requireAdmin }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, isAdmin: true, isFoundingAdmin: true, emailVerified: true, createdAt: true, failedLoginAttempts: true, loginLockedUntil: true, lastLoginAt: true },
      orderBy: [{ isFoundingAdmin: 'desc' }, { isAdmin: 'desc' }, { createdAt: 'asc' }],
    });
    reply.send(users);
  });

  // Toggle admin status for a user (founding admin only; cannot modify self or founding admin)
  app.put('/api/admin/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = validate(updateUserSchema, req.body, reply);
    if (!body) return;
    if (id === req.user.userId) return reply.status(400).send({ error: 'Cannot modify your own admin status.' });
    const target = await prisma.user.findUnique({ where: { id }, select: { isFoundingAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.isFoundingAdmin) return reply.status(403).send({ error: 'Cannot modify the founding admin.' });
    const updated = await prisma.user.update({ where: { id }, data: { isAdmin: body.isAdmin } });
    reply.send({ id: updated.id, isAdmin: updated.isAdmin });
  });

  // Grant admin status to a user — fires a security alert and writes an audit log entry
  app.put('/api/admin/users/:id/promote', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true, isFoundingAdmin: true } });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can promote users to admin.' });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true, email: true, isAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.isAdmin) return reply.status(400).send({ error: 'User is already an admin' });
    await prisma.user.update({ where: { id }, data: { isAdmin: true } });
    await prisma.adminLog.create({ data: { action: 'USER_PROMOTED', actorName: actor?.username, targetName: target.username } });
    sendSecurityAlert({ event: 'ADMIN_GRANTED', account: target.username, ip: req.ip, actor: actor?.username ?? 'unknown', timestamp: new Date().toISOString() });
    reply.send({ ok: true });
  });

  // Remove admin status — blocked if the target is the founding admin or the last admin
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
    sendSecurityAlert({ event: 'ADMIN_REVOKED', account: target.username, ip: req.ip, actor: actor?.username ?? 'unknown', timestamp: new Date().toISOString() });
    reply.send({ ok: true });
  });

  // Transfer the founding admin crown — atomically swaps isFoundingAdmin so there is always exactly one
  app.put('/api/admin/transfer-crown', { preHandler: requireAdmin }, async (req, reply) => {
    const crownBody = validate(transferCrownSchema, req.body, reply);
    if (!crownBody) return;
    const { userId: targetId } = crownBody;
    const actorId = req.user.userId;

    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { username: true, isFoundingAdmin: true } });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the current founding admin can transfer the crown.' });

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { username: true, isAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    // Target must already be an admin so they land in admin state after the transfer
    if (!target.isAdmin) return reply.status(400).send({ error: 'Target must be an admin before receiving the crown.' });
    if (targetId === actorId) return reply.status(400).send({ error: 'You already hold the crown.' });

    // Swap the isFoundingAdmin flag atomically so there is always exactly one founding admin
    await prisma.$transaction([
      prisma.user.update({ where: { id: actorId }, data: { isFoundingAdmin: false } }),
      prisma.user.update({ where: { id: targetId }, data: { isFoundingAdmin: true } }),
    ]);
    await prisma.adminLog.create({ data: { action: 'CROWN_TRANSFERRED', actorName: actor.username, targetName: target.username } });
    sendSecurityAlert({ event: 'CROWN_TRANSFERRED', account: target.username, ip: req.ip, actor: actor.username, timestamp: new Date().toISOString() });
    reply.send({ ok: true });
  });

  // Clear a login lockout without resetting loginLockCount (progressive escalation is preserved)
  app.put('/api/admin/users/:id/unlock', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    // Preserve loginLockCount so the progressive escalation schedule is maintained
    await prisma.user.update({ where: { id }, data: { failedLoginAttempts: 0, loginLockedUntil: null } });
    await prisma.adminLog.create({ data: { action: 'LOGIN_UNLOCKED', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // Increment tokenVersion to immediately invalidate all active sessions for a user
  app.put('/api/admin/users/:id/force-logout', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.user.userId) return reply.status(400).send({ error: 'Cannot force-logout yourself.' });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    await prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
    await prisma.adminLog.create({ data: { action: 'USER_FORCE_LOGGED_OUT', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // Manually mark a user's email as verified (bypasses the email link flow)
  app.put('/api/admin/users/:id/verify-email', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    await prisma.user.update({ where: { id }, data: { emailVerified: true } });
    await prisma.adminLog.create({ data: { action: 'EMAIL_VERIFIED_BY_ADMIN', actorName: actor?.username, targetName: target.username } });
    reply.send({ ok: true });
  });

  // Generate a one-time temporary password and force the user to change it on next login
  app.post('/api/admin/users/:id/reset-password', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.user.userId) return reply.status(400).send({ error: 'Cannot reset your own password via admin panel.' });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true, isFoundingAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.isFoundingAdmin) return reply.status(403).send({ error: 'Cannot reset the founding admin\'s password.' });
    // 12-char random password (letters + digits) — readable enough to relay verbally or via DM
    const tempPassword = randomBytes(9).toString('base64url').slice(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } } });
    await prisma.adminLog.create({ data: { action: 'PASSWORD_RESET_BY_ADMIN', actorName: actor?.username, targetName: target.username } });
    sendSecurityAlert({ event: 'PASSWORD_RESET_BY_ADMIN', account: target.username, ip: req.ip, actor: actor?.username ?? 'unknown', timestamp: new Date().toISOString() });
    reply.send({ ok: true, tempPassword });
  });

  // Permanently delete a user — founding admin only; blocks self-deletion and founding admin removal
  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // Self-deletion is blocked to prevent accidental lockout
    if (id === req.user.userId) return reply.status(400).send({ error: 'Cannot delete your own account via admin panel.' });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true, isFoundingAdmin: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { username: true, isFoundingAdmin: true } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.isFoundingAdmin) return reply.status(403).send({ error: 'Cannot delete the founding admin.' });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can delete users.' });
    await prisma.user.delete({ where: { id } });
    await prisma.adminLog.create({ data: { action: 'USER_DELETED', actorName: actor.username, targetName: target.username } });
    reply.status(204).send();
  });
}
