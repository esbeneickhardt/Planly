import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const createTokenSchema = z.object({ name: z.string().min(1), expiresAt: z.string().optional() });

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const TOKEN_SELECT = { id: true, name: true, appId: true, lastUsedAt: true, expiresAt: true, createdAt: true };

export async function apiTokenRoutes(app: FastifyInstance) {
  // List the current user's tokens (never exposes the raw token)
  app.get('/api/auth/tokens', { preHandler: requireAuth }, async (req, reply) => {
    const tokens = await prisma.apiToken.findMany({
      where: { userId: req.user.userId },
      select: TOKEN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    reply.send(tokens);
  });

  // Create a new token - the raw token value is returned exactly once
  app.post('/api/auth/tokens', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createTokenSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'name required' });
    const { name, expiresAt } = parsed.data;

    const existingCount = await prisma.apiToken.count({ where: { userId: req.user.userId } });
    if (existingCount >= 25) return reply.status(400).send({ error: 'Maximum 25 tokens allowed per user. Revoke an existing token first.' });

    // Format: planly_<48 hex chars> = 55 chars total, easy to identify in logs
    const rawToken = `planly_${randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(rawToken);

    const token = await prisma.apiToken.create({
      data: {
        userId: req.user.userId,
        name: name.trim(),
        tokenHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: TOKEN_SELECT,
    });

    // Include raw token in response - never stored, never retrievable again
    reply.status(201).send({ ...token, token: rawToken });
  });

  // Revoke a token
  app.delete('/api/auth/tokens/:tokenId', { preHandler: requireAuth }, async (req, reply) => {
    const { tokenId } = req.params as { tokenId: string };
    const { count } = await prisma.apiToken.deleteMany({ where: { id: tokenId, userId: req.user.userId } });
    if (count === 0) return reply.status(404).send({ error: 'Not found' });
    reply.send({ ok: true });
  });
}
