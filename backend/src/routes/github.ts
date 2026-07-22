/**
 * GitHub integration routes - admin configuration and inbound webhook receiver.
 *
 * Admins configure the webhook URL, HMAC secret, and import toggles via the config endpoints.
 * The public webhook receiver validates the GitHub HMAC-SHA256 signature then imports opened
 * issues and PRs as Planly tasks in the configured default project. Merged/closed PRs update
 * the linked task's status to 'done' or 'backlog' respectively.
 */
import { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import prisma from '../db/client';
import { validate } from '../utils/validate';
import { logger } from '../utils/logger';

// Validates the GitHub integration settings stored in ServerConfig
const githubConfigSchema = z.object({
  githubImportIssues: z.boolean().optional(),
  githubImportPrs: z.boolean().optional(),
  githubDefaultProductId: z.string().nullable().optional(),
});

// Verify GitHub HMAC-SHA256 payload signature using timing-safe comparison
function verifySignature(secret: string, rawBody: string | Buffer, signature: string | undefined): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.slice('sha256='.length);
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

export async function githubRoutes(app: FastifyInstance) {
  // ── Config endpoints (admin only) ─────────────────────────────────────────

  // Get webhook URL, current secret status, and import toggles
  app.get('/api/github/config', { preHandler: requireAdmin }, async (_req, reply) => {
    const config = await prisma.serverConfig.findUnique({ where: { id: 'main' } });
    reply.send({
      webhookUrl: `${process.env.APP_URL ?? ''}/api/github/webhook`,
      hasSecret: Boolean(config?.githubWebhookSecret),
      githubImportIssues: config?.githubImportIssues ?? false,
      githubImportPrs: config?.githubImportPrs ?? false,
      githubDefaultProductId: config?.githubDefaultProductId ?? null,
    });
  });

  // Save import settings (issue/PR toggles and default target project)
  app.post('/api/github/config', { preHandler: requireAdmin }, async (req, reply) => {
    const body = validate(githubConfigSchema, req.body, reply);
    if (!body) return;
    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      create: { id: 'main', ...body },
      update: body,
    });
    reply.send({ ok: true });
  });

  // Rotate the webhook secret (old secret is immediately invalidated)
  app.post('/api/github/regenerate-secret', { preHandler: requireAdmin }, async (_req, reply) => {
    const secret = randomBytes(32).toString('hex');
    await prisma.serverConfig.upsert({
      where: { id: 'main' },
      create: { id: 'main', githubWebhookSecret: secret },
      update: { githubWebhookSecret: secret },
    });
    reply.send({ secret });
  });

  // ── Webhook receiver (public, protected by HMAC signature) ─────────────────

  app.post(
    '/api/github/webhook',
    {
      config: { rawBody: true },
    },
    async (req, reply) => {
      const config = await prisma.serverConfig.findUnique({ where: { id: 'main' } });
      const secret = config?.githubWebhookSecret;

      if (secret) {
        const sig = req.headers['x-hub-signature-256'] as string | undefined;
        const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
        if (!verifySignature(secret, rawBody, sig)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      const event = req.headers['x-github-event'] as string | undefined;
      const payload = req.body as Record<string, unknown>;

      try {
        await handleGithubEvent(event, payload, config);
      } catch (err) {
        logger.warn({ err: (err as Error).message, event }, 'github webhook handler error');
      }

      reply.send({ ok: true });
    },
  );
}

async function handleGithubEvent(
  event: string | undefined,
  payload: Record<string, unknown>,
  config: { githubImportIssues: boolean; githubImportPrs: boolean; githubDefaultProductId: string | null } | null,
) {
  // Guard: no default project configured — nothing to import into
  if (!config?.githubDefaultProductId) return;
  const productId = config.githubDefaultProductId;

  // Verify the target project still exists and hasn't been soft-deleted
  const product = await prisma.product.findUnique({ where: { id: productId, deletedAt: null } });
  if (!product) return;

  if (event === 'issues' && config.githubImportIssues) {
    const action = payload.action as string;
    const issue = payload.issue as Record<string, unknown>;
    if (!issue) return;

    // Import opened GitHub issue as a Planly task
    if (action === 'opened') {
      const title = String(issue.title ?? 'Untitled GitHub issue');
      const url = String(issue.html_url ?? '');
      const body = issue.body ? `${String(issue.body)}\n\n[View on GitHub](${url})` : `[View on GitHub](${url})`;

      await prisma.task.create({
        data: {
          productId,
          name: title,
          description: body,
          githubUrl: url || null,
          status: 'backlog',
        },
      });
      logger.info({ productId, url }, 'github issue imported as task');
    }
  }

  if (event === 'pull_request' && config.githubImportPrs) {
    const action = payload.action as string;
    const pr = payload.pull_request as Record<string, unknown>;
    if (!pr) return;

    const url = String(pr.html_url ?? '');
    const title = String(pr.title ?? 'Untitled PR');

    // Import opened PR as a Planly task
    if (action === 'opened') {
      const body = pr.body ? `${String(pr.body)}\n\n[View PR on GitHub](${url})` : `[View PR on GitHub](${url})`;
      await prisma.task.create({
        data: {
          productId,
          name: `PR: ${title}`,
          description: body,
          githubUrl: url || null,
          status: 'backlog',
        },
      });
      logger.info({ productId, url }, 'github PR imported as task');
    }

    // Update task status when PR is closed or merged
    if (action === 'closed') {
      const merged = Boolean(pr.merged);
      const existing = await prisma.task.findFirst({
        where: { productId, githubUrl: url, deletedAt: null },
      });
      if (existing) {
        await prisma.task.update({
          where: { id: existing.id },
          data: { status: merged ? 'done' : 'backlog' },
        });
        logger.info({ productId, url, merged }, 'github PR closed - task updated');
      }
    }
  }
}
