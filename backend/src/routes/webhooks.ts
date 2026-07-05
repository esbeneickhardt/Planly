import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireProductCoOwner } from '../utils/product-guard';

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
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
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
    const { url, events } = req.body as { url?: string; events?: string[] };
    if (!url) return reply.status(400).send({ error: 'url required' });
    if (!events?.length) return reply.status(400).send({ error: 'events required' });

    const invalid = events.filter((e) => !VALID_EVENTS.includes(e));
    if (invalid.length > 0) return reply.status(400).send({ error: `Invalid events: ${invalid.join(', ')}` });

    try { new URL(url); } catch { return reply.status(400).send({ error: 'Invalid URL' }); }

    const secret = randomBytes(32).toString('hex');
    const webhook = await prisma.webhook.create({
      data: { productId, url, events, secret },
      select: { id: true, url: true, events: true, active: true, secret: true, createdAt: true },
    });
    // Return secret once at creation
    reply.status(201).send(webhook);
  });

  // Update webhook
  app.patch('/api/products/:productId/webhooks/:webhookId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, webhookId } = req.params as { productId: string; webhookId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const { url, events, active } = req.body as { url?: string; events?: string[]; active?: boolean };

    if (events) {
      const invalid = events.filter((e) => !VALID_EVENTS.includes(e));
      if (invalid.length > 0) return reply.status(400).send({ error: `Invalid events: ${invalid.join(', ')}` });
    }
    if (url) {
      try { new URL(url); } catch { return reply.status(400).send({ error: 'Invalid URL' }); }
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
    const secret = randomBytes(32).toString('hex');
    await prisma.webhook.update({ where: { id: webhookId }, data: { secret } });
    reply.send({ secret });
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
