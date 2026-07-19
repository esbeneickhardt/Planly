/**
 * Personal Access Token (PAT) routes - create and revoke long-lived API tokens
 * for scripting, CI/CD pipelines, and personal automations.
 *
 * Token values are raw random bytes returned only at creation. The database
 * stores a SHA-256 hash - the raw value can never be recovered from the DB.
 * Tokens can be optionally scoped to a single project (productId), restricting
 * them from accessing any other project or admin endpoints.
 */
import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../utils/validate';
import { logAdminEvent } from '../utils/audit';

// Validates token creation payload; productId scopes the token to a single project
const createTokenSchema = z.object({
  name: z.string().min(1),
  expiresAt: z.string().optional(),
  productId: z.string().uuid().optional(), // when set, token is restricted to this product only
});

// Returns a SHA-256 hex digest for safe storage without exposing the raw secret
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// Fields returned for token listings — never includes tokenHash
const TOKEN_SELECT = { id: true, name: true, appId: true, productId: true, lastUsedAt: true, expiresAt: true, createdAt: true };

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
    const body = validate(createTokenSchema, req.body, reply);
    if (!body) return;
    const { name, expiresAt, productId } = body;

    // If scoping to a product, verify caller is actually a member of that product
    if (productId) {
      const membership = await prisma.teamMember.findFirst({
        where: { userId: req.user.userId, team: { products: { some: { id: productId } } } },
      });
      if (!membership) return reply.status(403).send({ error: 'You are not a member of that project' });
    }

    // Enforce per-user token limit
    const existingCount = await prisma.apiToken.count({ where: { userId: req.user.userId } });
    if (existingCount >= 25) return reply.status(400).send({ error: 'Maximum 25 tokens allowed per user. Revoke an existing token first.' });

    // Generate token value and hash for storage
    // Format: planly_<48 hex chars> = 55 chars total, easy to identify in logs
    const rawToken = `planly_${randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(rawToken);

    const token = await prisma.apiToken.create({
      data: {
        userId: req.user.userId,
        name: name.trim(),
        tokenHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        productId: productId ?? null,
      },
      select: TOKEN_SELECT,
    });

    logAdminEvent('PAT_CREATED', { actorName: req.user.username, targetName: req.user.username, metadata: { tokenId: token.id, name: name.trim(), scoped: !!productId } });
    // Include raw token in response - never stored, never retrievable again
    reply.status(201).send({ ...token, token: rawToken });
  });

  // Revoke a token
  app.delete('/api/auth/tokens/:tokenId', { preHandler: requireAuth }, async (req, reply) => {
    const { tokenId } = req.params as { tokenId: string };
    const deleted = await prisma.apiToken.findFirst({ where: { id: tokenId, userId: req.user.userId }, select: { name: true } });
    const { count } = await prisma.apiToken.deleteMany({ where: { id: tokenId, userId: req.user.userId } });
    if (count === 0) return reply.status(404).send({ error: 'Not found' });
    logAdminEvent('PAT_REVOKED', { actorName: req.user.username, targetName: req.user.username, metadata: { tokenId, name: deleted?.name } });
    reply.status(204).send();
  });
}
