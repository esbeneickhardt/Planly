import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductCoOwner } from '../utils/product-guard';
import { encryptValue } from '../utils/crypto';

const createWebhookSchema = z.object({
  url: z.string().url('Invalid URL'),
  events: z.array(z.string()).min(1, 'events required'),
});
const updateWebhookSchema = z.object({
  url: z.string().url('Invalid URL').optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

const VALID_EVENTS = [
  'task.created', 'task.updated', 'task.deleted',
  'task.status_changed', 'task.assigned',
  'sprint.created', 'sprint.updated', 'sprint.deleted',
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
    const parsed = createWebhookSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { url, events } = parsed.data;

    const webhookCount = await prisma.webhook.count({ where: { productId } });
    if (webhookCount >= 20) return reply.status(400).send({ error: 'Maximum 20 webhooks allowed per project. Delete an existing webhook first.' });

    const invalid = events.filter((e) => !VALID_EVENTS.includes(e));
    if (invalid.length > 0) return reply.status(400).send({ error: `Invalid events: ${invalid.join(', ')}` });

    const rawSecret = randomBytes(32).toString('hex');
    const webhook = await prisma.webhook.create({
      data: { productId, url, events, secret: encryptValue(rawSecret) },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    });
    // Return the raw (unencrypted) secret once at creation
    reply.status(201).send({ ...webhook, secret: rawSecret });
  });

  // Update webhook
  app.patch('/api/products/:productId/webhooks/:webhookId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, webhookId } = req.params as { productId: string; webhookId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const parsed = updateWebhookSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { url, events, active } = parsed.data;

    if (events) {
      const invalid = events.filter((e) => !VALID_EVENTS.includes(e));
      if (invalid.length > 0) return reply.status(400).send({ error: `Invalid events: ${invalid.join(', ')}` });
    }

    const existing = await prisma.webhook.findFirst({ where: { id: webhookId, productId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const updated = await prisma.webhook.update({
      where: { id: webhookId },
      data: { url, events, active },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    });
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
    reply.send({ secret: rawSecret });
  });

  // Delete webhook
  app.delete('/api/products/:productId/webhooks/:webhookId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, webhookId } = req.params as { productId: string; webhookId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const existing = await prisma.webhook.findFirst({ where: { id: webhookId, productId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await prisma.webhook.delete({ where: { id: webhookId } });
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
