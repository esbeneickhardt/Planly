/**
 * Webhook routes - manage webhook subscriptions for a project.
 *
 * Webhooks push event payloads to external HTTP endpoints signed with HMAC-SHA256.
 * The secret is stored AES-256-GCM encrypted in the database and decrypted at
 * dispatch time. It is only returned in plaintext at creation and on secret rotation.
 *
 * All webhook URLs are validated for SSRF safety (no private IPs) before being
 * persisted. All lifecycle events are recorded in the admin audit log.
 */
import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductCoOwner } from '../utils/product-guard';
import { encryptValue } from '../utils/crypto';
import { validate } from '../utils/validate';
import { logAdminEvent } from '../utils/audit';
import { validateWebhookUrl } from '../utils/webhook-url-guard';

// Validates webhook creation — URL is validated for SSRF safety separately after schema validation
const createWebhookSchema = z.object({
  url: z.string().url('Invalid URL'),
  events: z.array(z.string()).min(1, 'events required'),
});
// Partial update payload for modifying URL, event subscriptions, or active state
const updateWebhookSchema = z.object({
  url: z.string().url('Invalid URL').optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// Exhaustive list of event names that can trigger a webhook delivery
const VALID_EVENTS = [
  'task.created', 'task.updated', 'task.deleted',
  'task.status_changed', 'task.assigned',
  'subplan.created', 'subplan.updated', 'subplan.deleted',
  'message.created',
];

export async function webhookRoutes(app: FastifyInstance) {
  // List webhooks for a product
  app.get('/api/products/:productId/webhooks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const webhooks = await prisma.webhook.findMany({
      where: { productId },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    reply.send(webhooks);
  });

  // Create webhook
  app.post('/api/products/:productId/webhooks', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const body = validate(createWebhookSchema, req.body, reply);
    if (!body) return;
    const { url, events } = body;

    // Enforce max webhook limit per project
    const webhookCount = await prisma.webhook.count({ where: { productId } });
    if (webhookCount >= 20) return reply.status(400).send({ error: 'Maximum 20 webhooks allowed per project. Delete an existing webhook first.' });

    // Validate requested event types against the supported set
    const invalid = events.filter((e) => !VALID_EVENTS.includes(e));
    if (invalid.length > 0) return reply.status(400).send({ error: `Invalid events: ${invalid.join(', ')}` });

    // Block internal/private-IP targets (SSRF guard)
    const urlError = await validateWebhookUrl(url);
    if (urlError) return reply.status(400).send({ error: urlError });

    // Generate HMAC secret, encrypt for storage, and persist the webhook
    const rawSecret = randomBytes(32).toString('hex');
    const webhook = await prisma.webhook.create({
      data: { productId, url, events, secret: encryptValue(rawSecret) },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    });
    logAdminEvent('WEBHOOK_CREATED', { actorName: req.user.username, targetName: productId, metadata: { webhookId: webhook.id, url, events } });
    // Return the raw (unencrypted) secret once at creation
    reply.status(201).send({ ...webhook, secret: rawSecret });
  });

  // Update webhook
  app.patch('/api/products/:productId/webhooks/:webhookId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, webhookId } = req.params as { productId: string; webhookId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const patch = validate(updateWebhookSchema, req.body, reply);
    if (!patch) return;
    const { url, events, active } = patch;

    if (events) {
      const invalid = events.filter((e) => !VALID_EVENTS.includes(e));
      if (invalid.length > 0) return reply.status(400).send({ error: `Invalid events: ${invalid.join(', ')}` });
    }

    if (url) {
      const urlError = await validateWebhookUrl(url);
      if (urlError) return reply.status(400).send({ error: urlError });
    }

    const existing = await prisma.webhook.findFirst({ where: { id: webhookId, productId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const updated = await prisma.webhook.update({
      where: { id: webhookId },
      data: { url, events, active },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    });
    logAdminEvent('WEBHOOK_UPDATED', { actorName: req.user.username, targetName: productId, metadata: { webhookId, changes: { url, events, active } } });
    reply.send(updated);
  });

  // Rotate webhook secret
  app.post('/api/products/:productId/webhooks/:webhookId/rotate-secret', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, webhookId } = req.params as { productId: string; webhookId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const existing = await prisma.webhook.findFirst({ where: { id: webhookId, productId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const rawSecret = randomBytes(32).toString('hex');
    await prisma.webhook.update({ where: { id: webhookId }, data: { secret: encryptValue(rawSecret) } });
    logAdminEvent('WEBHOOK_SECRET_ROTATED', { actorName: req.user.username, targetName: productId, metadata: { webhookId } });
    reply.send({ secret: rawSecret });
  });

  // Delete webhook
  app.delete('/api/products/:productId/webhooks/:webhookId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, webhookId } = req.params as { productId: string; webhookId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const existing = await prisma.webhook.findFirst({ where: { id: webhookId, productId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await prisma.webhook.delete({ where: { id: webhookId } });
    logAdminEvent('WEBHOOK_DELETED', { actorName: req.user.username, targetName: productId, metadata: { webhookId, url: existing.url } });
    reply.send({ ok: true });
  });

  // Webhook delivery history
  app.get('/api/products/:productId/webhooks/:webhookId/deliveries', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, webhookId } = req.params as { productId: string; webhookId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const existing = await prisma.webhook.findFirst({ where: { id: webhookId, productId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, event: true, statusCode: true, success: true, createdAt: true, responseBody: true },
    });
    reply.send(deliveries);
  });
}
