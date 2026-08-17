/**
 * Admin audit log routes - paginated queries, streaming CSV/JSONL export, pruning,
 * and the admin notification feed (a filtered view of high-severity audit events).
 * Exports stream row-by-row in batches of 1000 to avoid loading the full table into memory.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Readable } from 'stream';
import { requireAdmin } from '../../middleware/auth';
import prisma from '../../db/client';
import { validate } from '../../utils/validate';

// Validates the prune request - defaults to 90 days if olderThanDays is omitted
const pruneLogsSchema = z.object({ olderThanDays: z.number().int().min(1).optional() });

// Builds the Prisma where clause for log queries shared by GET and export routes
function buildLogWhere(action?: string, from?: string, to?: string) {
  return {
    ...(action ? { action } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };
}

// Subset of audit actions surfaced in the admin notification bell
const ADMIN_NOTIF_ACTIONS = [
  'USER_REGISTERED',
  'LOGIN_FAILED',
  'LOGIN_LOCKED',
  'LOGIN_UNLOCKED',
  'USER_PROMOTED',
  'USER_DEMOTED',
  'CROWN_TRANSFERRED',
  'FOUNDING_ADMIN_REGISTERED',
  'EMAIL_VERIFIED_BY_ADMIN',
  'USER_DELETED',
  'USER_SELF_DELETED',
  'SERVER_CONFIG_UPDATED',
  'LOGS_PRUNED',
  'TOTP_ENABLED',
  'TOTP_DISABLED',
  'WEBHOOK_CREATED',
  'WEBHOOK_DELETED',
  'PERMISSION_UPDATED',
  'TEAM_MEMBER_ADDED',
  'TEAM_MEMBER_REMOVED',
  'TEAM_MEMBER_ROLE_CHANGED',
];

export async function adminLogRoutes(app: FastifyInstance) {
  // Paginated audit log query with optional action, from, and to filters
  app.get('/api/admin/logs', { preHandler: requireAdmin }, async (req, reply) => {
    const {
      limit = '50',
      cursor,
      action,
      from,
      to,
    } = req.query as { limit?: string; cursor?: string; action?: string; from?: string; to?: string };
    const take = Math.min(parseInt(limit) || 50, 200);
    const where = buildLogWhere(action, from, to);
    const logs = await prisma.adminLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    reply.send({ logs, nextCursor: logs.length === take ? (logs[logs.length - 1]?.id ?? null) : null });
  });

  // Stream a full CSV or JSONL export of the audit log in batches (avoids loading the full table into memory)
  app.get('/api/admin/logs/export', { preHandler: requireAdmin }, async (req, reply) => {
    const {
      format = 'csv',
      action,
      from,
      to,
    } = req.query as { format?: string; action?: string; from?: string; to?: string };
    const fmt = format === 'jsonl' ? 'jsonl' : 'csv';
    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${fmt}`;
    const where = buildLogWhere(action, from, to);

    // Start streaming before fetching data so large exports don't buffer in memory
    reply.header('Content-Type', fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    const readable = new Readable({ read() {} });
    reply.send(readable);

    if (fmt === 'csv') readable.push('id,action,actorId,actorName,targetId,targetName,createdAt,metadata\n');

    // Page through the table in batches to avoid loading everything into memory at once
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
          // Prefix fields starting with formula-injection characters to prevent spreadsheet attacks
          const csvField = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
          const meta = row.metadata ? JSON.stringify(row.metadata).replace(/"/g, '""') : '';
          readable.push(
            `"${row.id}","${row.action}","${row.actorId ?? ''}","${csvField(row.actorName ?? '')}","${row.targetId ?? ''}","${csvField(row.targetName ?? '')}","${row.createdAt.toISOString()}","${meta}"\n`,
          );
        } else {
          readable.push(JSON.stringify(row) + '\n');
        }
      }
      if (batch.length < BATCH) break;
      batchCursor = batch[batch.length - 1]?.id;
    }
    readable.push(null);
  });

  // Return the latest high-severity audit events for the admin notification bell
  app.get('/api/admin/notifications', { preHandler: requireAdmin }, async (req, reply) => {
    const { limit = '30' } = req.query as { limit?: string };
    const take = Math.min(parseInt(limit), 100);
    const entries = await prisma.adminLog.findMany({
      where: { action: { in: ADMIN_NOTIF_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    reply.send({ entries });
  });

  // Count high-severity audit events newer than a given timestamp (used for the notification badge)
  app.get('/api/admin/notifications/unread-count', { preHandler: requireAdmin }, async (req, reply) => {
    const { since } = req.query as { since?: string };
    if (!since) return reply.send({ count: 0 });
    const count = await prisma.adminLog.count({
      where: { action: { in: ADMIN_NOTIF_ACTIONS }, createdAt: { gt: new Date(since) } },
    });
    reply.send({ count });
  });

  // Permanently delete audit log entries older than the given threshold (founding admin only)
  app.delete('/api/admin/logs/prune', { preHandler: requireAdmin }, async (req, reply) => {
    const pruneBody = validate(pruneLogsSchema, req.body, reply);
    if (!pruneBody) return;
    const days = Math.max(1, pruneBody.olderThanDays ?? 90);
    const actor = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { username: true, isFoundingAdmin: true },
    });
    // Pruning is restricted to the founding admin to prevent accidental audit trail destruction
    if (!actor?.isFoundingAdmin) return reply.status(403).send({ error: 'Only the founding admin can prune logs.' });
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.adminLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    // Write a prune record after deletion so the action itself is audited
    await prisma.adminLog.create({
      data: {
        action: 'LOGS_PRUNED',
        actorName: actor.username,
        metadata: { olderThanDays: days, deletedCount: count, cutoff },
      },
    });
    reply.send({ ok: true, deletedCount: count });
  });
}
