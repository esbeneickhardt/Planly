/**
 * Admin audit log — paginated queries, CSV/JSONL export, prune, and admin notifications.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Readable } from 'stream';
import { requireAdmin } from '../../middleware/auth';
import prisma from '../../db/client';
import { validate } from '../../utils/validate';

const pruneLogsSchema = z.object({ olderThanDays: z.number().int().min(1).optional() });

function buildLogWhere(action?: string, from?: string, to?: string) {
  return {
    ...(action ? { action } : {}),
    ...((from || to) ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
  };
}

const ADMIN_NOTIF_ACTIONS = [
  'USER_REGISTERED', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'LOGIN_UNLOCKED',
  'USER_PROMOTED', 'USER_DEMOTED', 'CROWN_TRANSFERRED', 'FOUNDING_ADMIN_REGISTERED',
  'EMAIL_VERIFIED_BY_ADMIN', 'USER_DELETED', 'USER_SELF_DELETED', 'SERVER_CONFIG_UPDATED',
  'LOGS_PRUNED', 'TOTP_ENABLED', 'TOTP_DISABLED', 'WEBHOOK_CREATED', 'WEBHOOK_DELETED',
  'PERMISSION_UPDATED', 'TEAM_MEMBER_ADDED', 'TEAM_MEMBER_REMOVED', 'TEAM_MEMBER_ROLE_CHANGED',
];

export async function adminLogRoutes(app: FastifyInstance) {
  app.get('/api/admin/logs', { preHandler: requireAdmin }, async (req, reply) => {
    const { limit = '50', cursor, action, from, to } = req.query as { limit?: string; cursor?: string; action?: string; from?: string; to?: string };
    const take = Math.min(parseInt(limit) || 50, 200);
    const where = buildLogWhere(action, from, to);
    const logs = await prisma.adminLog.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    reply.send({ logs, nextCursor: logs.length === take ? (logs[logs.length - 1]?.id ?? null) : null });
  });

  app.get('/api/admin/logs/export', { preHandler: requireAdmin }, async (req, reply) => {
    const { format = 'csv', action, from, to } = req.query as { format?: string; action?: string; from?: string; to?: string };
    const fmt = format === 'jsonl' ? 'jsonl' : 'csv';
    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${fmt}`;
    const where = buildLogWhere(action, from, to);

    reply.header('Content-Type', fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    const readable = new Readable({ read() {} });
    reply.send(readable);

    if (fmt === 'csv') readable.push('id,action,actorId,actorName,targetId,targetName,createdAt,metadata\n');

    let batchCursor: string | undefined;
    const BATCH = 1000;
    while (true) {
      const batch = await prisma.adminLog.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: BATCH,
        ...(batchCursor ? { cursor: { id: batchCursor }, skip: 1 } : {}),
      });
      for (const row of batch) {
        if (fmt === 'csv') {
          const csvField = (v: string) => /^[=+\-@]/.test(v) ? `'${v}` : v;
          const meta = row.metadata ? JSON.stringify(row.metadata).replace(/"/g, '""') : '';
          readable.push(`"${row.id}","${row.action}","${row.actorId ?? ''}","${csvField(row.actorName ?? '')}","${row.targetId ?? ''}","${csvField(row.targetName ?? '')}","${row.createdAt.toISOString()}","${meta}"\n`);
        } else {
          readable.push(JSON.stringify(row) + '\n');
        }
      }
      if (batch.length < BATCH) break;
      batchCursor = batch[batch.length - 1]?.id;
    }
    readable.push(null);
  });

  app.get('/api/admin/notifications', { preHandler: requireAdmin }, async (req, reply) => {
    const { limit = '30' } = req.query as { limit?: string };
    const take = Math.min(parseInt(limit), 100);
    const entries = await prisma.adminLog.findMany({ where: { action: { in: ADMIN_NOTIF_ACTIONS } }, orderBy: { createdAt: 'desc' }, take });
    reply.send({ entries });
  });

  app.get('/api/admin/notifications/unread-count', { preHandler: requireAdmin }, async (req, reply) => {
    const { since } = req.query as { since?: string };
    if (!since) return reply.send({ count: 0 });
    const count = await prisma.adminLog.count({ where: { action: { in: ADMIN_NOTIF_ACTIONS }, createdAt: { gt: new Date(since) } } });
    reply.send({ count });
  });

  app.delete('/api/admin/logs/prune', { preHandler: requireAdmin }, async (req, reply) => {
    const pruneBody = validate(pruneLogsSchema, req.body, reply);
    if (!pruneBody) return;
    const days = Math.max(1, pruneBody.olderThanDays ?? 90);
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true, isFoundingAdmin: true } });
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can prune logs.' });
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.adminLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await prisma.adminLog.create({ data: { action: 'LOGS_PRUNED', actorName: actor.username, metadata: { olderThanDays: days, deletedCount: count, cutoff } } });
    reply.send({ ok: true, deletedCount: count });
  });
}
