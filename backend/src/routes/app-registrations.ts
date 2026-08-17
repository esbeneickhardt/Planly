/**
 * App Registration routes - named service accounts for server-to-server integrations.
 *
 * Unlike PATs which act as a specific user, App Registrations represent an application
 * identity. Each registration can hold multiple tokens (for rotation without downtime).
 * Token values are returned only at creation; the DB stores SHA-256 hashes only.
 * Registrations can be scoped to a single project via productId, restricting every token
 * issued under them to that project.
 */
import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireInteractiveAuth } from '../middleware/auth';
import { validate } from '../utils/validate';
import { logAdminEvent } from '../utils/audit';
import { handleNotFound } from '../utils/prisma-errors';

// Validates app registration creation; productId scopes the registration and all its tokens
const createAppSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  productId: z.string().uuid().optional(), // scopes all tokens in this registration to one product
});
// Partial update for renaming or re-describing a registration
const updateAppSchema = z.object({ name: z.string().optional(), description: z.string().optional() });
// Per-tab permission levels for an app registration (all fields optional — absent means 'write')
const level = z.enum(['write', 'read', 'none']).optional();
const permissionsSchema = z.object({
  kanban: level,
  backlog: level,
  gantt: level,
  canvas: level,
  messages: level,
  analytics: level,
});
// Validates token creation within an app; inherits productId scope from the parent registration
const createAppTokenSchema = z.object({
  name: z.string().min(1),
  expiresAt: z.string().optional(),
});

// Returns a SHA-256 hex digest for safe storage without exposing the raw secret
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// Fields returned for app registration listings — never includes token hashes
const APP_SELECT = {
  id: true,
  name: true,
  description: true,
  ownerId: true,
  productId: true,
  permissions: true,
  createdAt: true,
};
// Fields returned for token listings under an app — never includes tokenHash
const TOKEN_SELECT = { id: true, name: true, appId: true, lastUsedAt: true, expiresAt: true, createdAt: true };

export async function appRegistrationRoutes(app: FastifyInstance) {
  // List the current user's app registrations
  app.get('/api/apps', { preHandler: requireInteractiveAuth }, async (req, reply) => {
    const apps = await prisma.appRegistration.findMany({
      where: { ownerId: req.user.userId },
      select: APP_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    reply.send(apps);
  });

  // Create a new app registration
  app.post('/api/apps', { preHandler: requireInteractiveAuth }, async (req, reply) => {
    const body = validate(createAppSchema, req.body, reply);
    if (!body) return;
    const { name, description, productId } = body;

    // Verify caller is a member of the target product before scoping the registration to it
    if (productId) {
      const membership = await prisma.teamMember.findFirst({
        where: { userId: req.user.userId, team: { products: { some: { id: productId } } } },
      });
      if (!membership) return reply.status(403).send({ error: 'You are not a member of that project' });
    }

    const registration = await prisma.appRegistration.create({
      data: { name: name.trim(), description, ownerId: req.user.userId, productId: productId ?? null },
      select: APP_SELECT,
    });
    logAdminEvent('APP_CREATED', {
      actorName: req.user.username,
      targetName: name.trim(),
      metadata: { appId: registration.id, scoped: !!productId },
    });
    reply.status(201).send(registration);
  });

  // Update app registration metadata
  app.patch('/api/apps/:appId', { preHandler: requireInteractiveAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    const body = validate(updateAppSchema, req.body, reply);
    if (!body) return;
    const { name, description } = body;
    try {
      const registration = await prisma.appRegistration.update({
        where: { id: appId, ownerId: req.user.userId },
        data: { name, description },
        select: APP_SELECT,
      });
      reply.send(registration);
    } catch (e) {
      handleNotFound(e, reply);
    }
  });

  // Delete an app registration and all its tokens
  app.delete('/api/apps/:appId', { preHandler: requireInteractiveAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    try {
      const existing = await prisma.appRegistration.findUnique({
        where: { id: appId, ownerId: req.user.userId },
        select: { name: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Not found' });
      await prisma.appRegistration.delete({ where: { id: appId, ownerId: req.user.userId } });
      logAdminEvent('APP_DELETED', { actorName: req.user.username, targetName: existing.name, metadata: { appId } });
      reply.send({ ok: true });
    } catch (e) {
      handleNotFound(e, reply);
    }
  });

  // List tokens for an app
  app.get('/api/apps/:appId/tokens', { preHandler: requireInteractiveAuth }, async (req, reply) => {
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

  // Create a token for an app - acts as the owning user's identity, inherits app's product scope
  app.post('/api/apps/:appId/tokens', { preHandler: requireInteractiveAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    const appExists = await prisma.appRegistration.findUnique({
      where: { id: appId, ownerId: req.user.userId },
      select: { name: true, productId: true },
    });
    if (!appExists) return reply.status(404).send({ error: 'Not found' });

    const tokenBody = validate(createAppTokenSchema, req.body, reply);
    if (!tokenBody) return;
    const { name, expiresAt } = tokenBody;

    const rawToken = `planly_${randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(rawToken);

    const token = await prisma.apiToken.create({
      data: {
        userId: req.user.userId,
        appId,
        name: name.trim(),
        tokenHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        // Inherit the app registration's product scope so every token in the app is automatically bounded
        productId: appExists.productId ?? null,
      },
      select: TOKEN_SELECT,
    });
    logAdminEvent('APP_TOKEN_CREATED', {
      actorName: req.user.username,
      targetName: appExists.name,
      metadata: { appId, tokenId: token.id, name: name.trim(), scoped: !!appExists.productId },
    });
    reply.status(201).send({ ...token, token: rawToken });
  });

  // Update per-tab permissions for an app registration
  app.patch('/api/apps/:appId/permissions', { preHandler: requireInteractiveAuth }, async (req, reply) => {
    const { appId } = req.params as { appId: string };
    const body = validate(permissionsSchema, req.body, reply);
    if (!body) return;
    try {
      const registration = await prisma.appRegistration.update({
        where: { id: appId, ownerId: req.user.userId },
        data: { permissions: body },
        select: APP_SELECT,
      });
      reply.send(registration);
    } catch (e) {
      handleNotFound(e, reply);
    }
  });

  // Revoke a specific app token
  app.delete('/api/apps/:appId/tokens/:tokenId', { preHandler: requireInteractiveAuth }, async (req, reply) => {
    const { appId, tokenId } = req.params as { appId: string; tokenId: string };
    const existing = await prisma.apiToken.findFirst({
      where: { id: tokenId, appId, userId: req.user.userId },
      select: { name: true },
    });
    const { count } = await prisma.apiToken.deleteMany({ where: { id: tokenId, appId, userId: req.user.userId } });
    if (count === 0) return reply.status(404).send({ error: 'Not found' });
    logAdminEvent('APP_TOKEN_REVOKED', {
      actorName: req.user.username,
      metadata: { appId, tokenId, name: existing?.name },
    });
    reply.send({ ok: true });
  });
}
