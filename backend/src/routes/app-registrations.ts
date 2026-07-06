import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const createAppSchema = z.object({ name: z.string().min(1), description: z.string().optional() });
const updateAppSchema = z.object({ name: z.string().optional(), description: z.string().optional() });
const createAppTokenSchema = z.object({ name: z.string().min(1), expiresAt: z.string().optional() });

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const APP_SELECT = { id: true, name: true, description: true, ownerId: true, createdAt: true };
const TOKEN_SELECT = { id: true, name: true, appId: true, lastUsedAt: true, expiresAt: true, createdAt: true };

export async function appRegistrationRoutes(app: FastifyInstance) {
  // List the current user's app registrations
  app.get('/api/apps', { preHandler: requireAuth }, async (req, reply) => {
    const apps = await prisma.appRegistration.findMany({
      where: { ownerId: req.user.userId },
      select: APP_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    reply.send(apps);
  });

  // Create a new app registration
  app.post('/api/apps', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createAppSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'name required' });
    const { name, description } = parsed.data;

    const registration = await prisma.appRegistration.create({
      data: { name: name.trim(), description, ownerId: req.user.userId },
      select: APP_SELECT,
    });
    reply.status(201).send(registration);
  });

  // Update app registration metadata
  app.patch('/api/apps/:appId', { preHandler: requireAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    const parsed = updateAppSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { name, description } = parsed.data;
    try {
      const registration = await prisma.appRegistration.update({
        where: { id: appId, ownerId: req.user.userId },
        data: { name, description },
        select: APP_SELECT,
      });
      reply.send(registration);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // Delete an app registration and all its tokens
  app.delete('/api/apps/:appId', { preHandler: requireAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    try {
      await prisma.appRegistration.delete({ where: { id: appId, ownerId: req.user.userId } });
      reply.send({ ok: true });
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // List tokens for an app
  app.get('/api/apps/:appId/tokens', { preHandler: requireAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    const appExists = await prisma.appRegistration.findUnique({ where: { id: appId, ownerId: req.user.userId } });
    if (!appExists) return reply.status(404).send({ error: 'Not found' });
    const tokens = await prisma.apiToken.findMany({
      where: { appId },
      select: TOKEN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    reply.send(tokens);
  });

  // Create a token for an app - acts as the owning user's identity
  app.post('/api/apps/:appId/tokens', { preHandler: requireAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    const appExists = await prisma.appRegistration.findUnique({ where: { id: appId, ownerId: req.user.userId } });
    if (!appExists) return reply.status(404).send({ error: 'Not found' });

    const parsed = createAppTokenSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'name required' });
    const { name, expiresAt } = parsed.data;

    const rawToken = `planly_${randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(rawToken);

    const token = await prisma.apiToken.create({
      data: {
        userId: req.user.userId,
        appId,
        name: name.trim(),
        tokenHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: TOKEN_SELECT,
    });
    reply.status(201).send({ ...token, token: rawToken });
  });

  // Revoke a specific app token
  app.delete('/api/apps/:appId/tokens/:tokenId', { preHandler: requireAuth }, async (req, reply) => {
    const { appId, tokenId } = req.params as { appId: string; tokenId: string };
    const { count } = await prisma.apiToken.deleteMany({ where: { id: tokenId, appId, userId: req.user.userId } });
    if (count === 0) return reply.status(404).send({ error: 'Not found' });
    reply.send({ ok: true });
  });
}
