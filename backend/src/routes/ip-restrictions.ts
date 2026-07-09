/**
 * IP restriction routes — manage the server-wide IP allowlist / blocklist.
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
import { config } from '../config/env';
import { requireAdmin } from '../middleware/auth';
import { validate } from '../utils/validate';

const setModeSchema = z.object({ mode: z.enum(['disabled', 'allowlist', 'blocklist']) });
const addRuleSchema = z.object({ cidr: z.string().min(1), description: z.string().optional() });

// ── CIDR matching ──────────────────────────────────────────────────────────────

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) | parseInt(octet, 10)) >>> 0, 0) >>> 0;
}

export function matchesCidr(clientIp: string, cidr: string): boolean {
  // Strip IPv6-mapped IPv4 prefix
  const ip = clientIp.startsWith('::ffff:') ? clientIp.slice(7) : clientIp;

  if (!cidr.includes('/')) {
    // Exact match (supports IPv6)
    return ip === cidr;
  }

  const [network, prefixStr] = cidr.split('/') as [string, string];
  const prefix = parseInt(prefixStr, 10);

  if (!isIPv4(ip) || !isIPv4(network)) return false;
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const raw = process.env.TRUSTED_PROXY_DEPTH;
  const depth = raw === undefined ? config.trustedProxyDepth : parseInt(raw, 10);

  // depth=0 means no trusted proxy — use socket address directly
  if (depth <= 0) return req.socket.remoteAddress ?? '';

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) {
      // Proxies append to the right; the client IP sits depth entries from the right
      const idx = Math.max(0, list.length - depth);
      return list[idx] ?? '';
    }
  }
  return req.socket.remoteAddress ?? '';
}

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
}
