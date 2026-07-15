/**
 * IP restriction routes - manage the server-wide IP allowlist / blocklist.
 *
 * Three modes: 'disabled' (default), 'allowlist' (only listed CIDRs allowed),
 * 'blocklist' (listed CIDRs denied). Evaluated in the global preHandler hook in index.ts.
 *
 * The management endpoints themselves are always exempt from IP filtering to prevent
 * admins from locking themselves out. Localhost is also always allowed.
 *
 * Also exports the getClientIp() and matchesCidr() helpers used by the global hook.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isIPv4 } from 'net';
import prisma from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { validate } from '../utils/validate';
import { matchesCidr, getClientIp } from '../utils/ip';

// Re-export so index.ts can import from this module as before
export { matchesCidr, getClientIp };

const setModeSchema = z.object({ mode: z.enum(['disabled', 'allowlist', 'blocklist']) });
const addRuleSchema = z.object({ cidr: z.string().min(1), description: z.string().optional() });

// ── Routes ─────────────────────────────────────────────────────────────────────

export async function ipRestrictionRoutes(app: FastifyInstance) {
  // Get current rules + mode + caller's IP
  app.get('/api/admin/ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const [rules, config] = await Promise.all([
      prisma.ipRestriction.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.serverConfig.findUnique({ where: { id: 'main' }, select: { ipRestrictionMode: true } }),
    ]);
    reply.send({
      mode: config?.ipRestrictionMode ?? 'disabled',
      rules,
      yourIp: getClientIp(req as never),
    });
  });

  // Update mode (disabled / allowlist / blocklist)
  app.put('/api/admin/ip-restrictions/mode', { preHandler: requireAdmin }, async (req, reply) => {
    const body = validate(setModeSchema, req.body, reply);
    if (!body) return;
    const { mode } = body;
    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      update: { ipRestrictionMode: mode },
      create: { id: 'main', ipRestrictionMode: mode },
    });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    await prisma.adminLog.create({ data: { action: 'IP_RESTRICTION_MODE_CHANGED', actorName: actor?.username, metadata: { mode } } });
    reply.send({ ok: true });
  });

  // Add a rule
  app.post('/api/admin/ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const ruleBody = validate(addRuleSchema, req.body, reply);
    if (!ruleBody) return;
    const { cidr, description } = ruleBody;

    const normalized = cidr.trim();
    // Basic validation: must be a valid IP or CIDR
    const [host, prefix] = normalized.split('/') as [string, string | undefined];
    const validIp = isIPv4(host) || host.includes(':'); // IPv4 or IPv6
    if (!validIp) return reply.status(400).send({ error: 'Invalid IP address or CIDR range' });
    if (prefix !== undefined) {
      const p = parseInt(prefix, 10);
      const isIpv6 = host.includes(':');
      const maxPrefix = isIpv6 ? 128 : 32;
      if (isNaN(p) || p < 0 || p > maxPrefix) {
        return reply.status(400).send({ error: `CIDR prefix must be 0–${maxPrefix}` });
      }
    }

    try {
      const rule = await prisma.ipRestriction.create({ data: { cidr: normalized, description: description?.trim() || null } });
      const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
      await prisma.adminLog.create({ data: { action: 'IP_RULE_ADDED', actorName: actor?.username, metadata: { cidr: normalized } } });
      reply.status(201).send(rule);
    } catch {
      reply.status(409).send({ error: 'That IP / CIDR range is already in the list' });
    }
  });

  // Delete a rule
  app.delete('/api/admin/ip-restrictions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = await prisma.ipRestriction.findUnique({ where: { id } });
    if (!rule) return reply.status(404).send({ error: 'Not found' });
    await prisma.ipRestriction.delete({ where: { id } });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    await prisma.adminLog.create({ data: { action: 'IP_RULE_REMOVED', actorName: actor?.username, metadata: { cidr: rule.cidr } } });
    reply.send({ ok: true });
  });

  // ── Admin-scope IP restrictions ────────────────────────────────────────────
  // These rules gate /api/admin/* access only — independent of the user-facing rules above.
  // The management endpoints below are always exempt from the admin IP check so admins
  // can never lock themselves out of the controls needed to fix a misconfiguration.

  // Get current admin IP rules + mode + caller's IP
  app.get('/api/admin/admin-ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const [rules, cfg] = await Promise.all([
      prisma.adminIpRestriction.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.serverConfig.findUnique({ where: { id: 'main' }, select: { adminIpRestrictionMode: true } }),
    ]);
    reply.send({ mode: cfg?.adminIpRestrictionMode ?? 'disabled', rules, yourIp: getClientIp(req as never) });
  });

  // Update admin IP restriction mode (disabled / allowlist / blocklist)
  app.put('/api/admin/admin-ip-restrictions/mode', { preHandler: requireAdmin }, async (req, reply) => {
    const body = validate(setModeSchema, req.body, reply);
    if (!body) return;
    const { mode } = body;
    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      update: { adminIpRestrictionMode: mode },
      create: { id: 'main', adminIpRestrictionMode: mode },
    });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    await prisma.adminLog.create({ data: { action: 'ADMIN_IP_RESTRICTION_MODE_CHANGED', actorName: actor?.username, metadata: { mode } } });
    reply.send({ ok: true });
  });

  // Add an admin IP rule
  app.post('/api/admin/admin-ip-restrictions', { preHandler: requireAdmin }, async (req, reply) => {
    const ruleBody = validate(addRuleSchema, req.body, reply);
    if (!ruleBody) return;
    const { cidr, description } = ruleBody;

    const normalized = cidr.trim();
    const [host, prefix] = normalized.split('/') as [string, string | undefined];
    const validIp = isIPv4(host) || host.includes(':');
    if (!validIp) return reply.status(400).send({ error: 'Invalid IP address or CIDR range' });
    if (prefix !== undefined) {
      const p = parseInt(prefix, 10);
      const maxPrefix = host.includes(':') ? 128 : 32;
      if (isNaN(p) || p < 0 || p > maxPrefix) return reply.status(400).send({ error: `CIDR prefix must be 0–${maxPrefix}` });
    }

    try {
      const rule = await prisma.adminIpRestriction.create({ data: { cidr: normalized, description: description?.trim() || null } });
      const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
      await prisma.adminLog.create({ data: { action: 'ADMIN_IP_RULE_ADDED', actorName: actor?.username, metadata: { cidr: normalized } } });
      reply.status(201).send(rule);
    } catch {
      reply.status(409).send({ error: 'That IP / CIDR range is already in the admin list' });
    }
  });

  // Remove an admin IP rule
  app.delete('/api/admin/admin-ip-restrictions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = await prisma.adminIpRestriction.findUnique({ where: { id } });
    if (!rule) return reply.status(404).send({ error: 'Not found' });
    await prisma.adminIpRestriction.delete({ where: { id } });
    const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { username: true } });
    await prisma.adminLog.create({ data: { action: 'ADMIN_IP_RULE_REMOVED', actorName: actor?.username, metadata: { cidr: rule.cidr } } });
    reply.send({ ok: true });
  });
}
