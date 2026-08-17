/**
 * IP restriction routes - two independent rule sets per scope (user / admin).
 *
 * Each scope has an allowlist and a blocklist that work together:
 *   - Blocklist entries are always denied.
 *   - If the allowlist is non-empty, only listed IPs are permitted.
 *   - An empty allowlist means no allowlist filtering (everyone not blocked is allowed).
 *   - Blocklist takes precedence: an IP on both lists is denied.
 *
 * User rules apply to all non-admin requests.
 * Admin rules apply only to /api/admin/* routes (evaluated inside requireAdmin).
 *
 * The management endpoints are always exempt so a misconfiguration can always be fixed.
 * Also exports getClientIp() and matchesCidr() used by the global preHandler hook.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isIPv4 } from 'net';
import prisma from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { validate } from '../utils/validate';
import { matchesCidr, getClientIp } from '../utils/ip';
import { handleConflict } from '../utils/prisma-errors';

export { matchesCidr, getClientIp };

const addRuleSchema = z.object({
  cidr: z.string().min(1),
  listType: z.enum(['allowlist', 'blocklist']),
  description: z.string().optional(),
});

function validateCidr(cidr: string): string | null {
  const [host, prefix] = cidr.split('/') as [string, string | undefined];
  if (!isIPv4(host) && !host.includes(':')) return 'Invalid IP address or CIDR range';
  if (prefix !== undefined) {
    const p = parseInt(prefix, 10);
    const max = host.includes(':') ? 128 : 32;
    if (isNaN(p) || p < 0 || p > max) return `CIDR prefix must be 0–${max}`;
  }
  return null;
}

export async function ipRestrictionRoutes(app: FastifyInstance) {
  // ── User IP rules ─────────────────────────────────────────────────────────────

  app.get('/api/admin/ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const [allowlistRules, blocklistRules] = await Promise.all([
      prisma.ipRestriction.findMany({
        where: { listType: 'allowlist' },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.ipRestriction.findMany({
        where: { listType: 'blocklist' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    reply.send({
      allowlistRules,
      blocklistRules,
      yourIp: getClientIp(req as never),
    });
  });

  app.post('/api/admin/ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const body = validate(addRuleSchema, req.body, reply);
    if (!body) return;
    const normalized = body.cidr.trim();
    const err = validateCidr(normalized);
    if (err) return reply.status(400).send({ error: err });
    try {
      const rule = await prisma.ipRestriction.create({
        data: {
          cidr: normalized,
          listType: body.listType,
          description: body.description?.trim() || null,
        },
      });
      await prisma.adminLog.create({
        data: {
          action: 'IP_RULE_ADDED',
          actorName: req.user.username,
          metadata: { cidr: normalized, listType: body.listType },
        },
      });
      reply.status(201).send(rule);
    } catch (e) {
      handleConflict(e, reply, 'That IP / CIDR is already in this list');
    }
  });

  app.delete('/api/admin/ip-restrictions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = await prisma.ipRestriction.findUnique({ where: { id } });
    if (!rule) return reply.status(404).send({ error: 'Not found' });
    await prisma.ipRestriction.delete({ where: { id } });
    await prisma.adminLog.create({
      data: {
        action: 'IP_RULE_REMOVED',
        actorName: req.user.username,
        metadata: { cidr: rule.cidr, listType: rule.listType },
      },
    });
    reply.send({ ok: true });
  });

  // ── Admin IP rules ────────────────────────────────────────────────────────────

  app.get('/api/admin/admin-ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const [allowlistRules, blocklistRules] = await Promise.all([
      prisma.adminIpRestriction.findMany({
        where: { listType: 'allowlist' },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.adminIpRestriction.findMany({
        where: { listType: 'blocklist' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    reply.send({
      allowlistRules,
      blocklistRules,
      yourIp: getClientIp(req as never),
    });
  });

  app.post('/api/admin/admin-ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const body = validate(addRuleSchema, req.body, reply);
    if (!body) return;
    const normalized = body.cidr.trim();
    const err = validateCidr(normalized);
    if (err) return reply.status(400).send({ error: err });
    try {
      const rule = await prisma.adminIpRestriction.create({
        data: {
          cidr: normalized,
          listType: body.listType,
          description: body.description?.trim() || null,
        },
      });
      await prisma.adminLog.create({
        data: {
          action: 'ADMIN_IP_RULE_ADDED',
          actorName: req.user.username,
          metadata: { cidr: normalized, listType: body.listType },
        },
      });
      reply.status(201).send(rule);
    } catch (e) {
      handleConflict(e, reply, 'That IP / CIDR is already in this admin list');
    }
  });

  app.delete('/api/admin/admin-ip-restrictions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = await prisma.adminIpRestriction.findUnique({
      where: { id },
    });
    if (!rule) return reply.status(404).send({ error: 'Not found' });
    await prisma.adminIpRestriction.delete({ where: { id } });
    await prisma.adminLog.create({
      data: {
        action: 'ADMIN_IP_RULE_REMOVED',
        actorName: req.user.username,
        metadata: { cidr: rule.cidr, listType: rule.listType },
      },
    });
    reply.send({ ok: true });
  });
}
