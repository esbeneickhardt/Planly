import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const PRESET_COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];
const DEFAULT_NAMES: Record<string, string> = {
  '#7c3aed': 'Feature', '#3b82f6': 'Bug', '#10b981': 'Enhancement',
  '#f59e0b': 'Milestone', '#ef4444': 'Blocker', '#ec4899': 'Design',
  '#06b6d4': 'Infrastructure', '#f97316': 'Research',
};

export async function colorLegendRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/color-legend', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const entries = await prisma.colorLegendEntry.findMany({ where: { productId } });
    const entryMap = new Map(entries.map((e) => [e.colorKey, e]));

    const result = PRESET_COLORS.map((color) => {
      const entry = entryMap.get(color);
      return {
        colorKey: color,
        name: entry?.name ?? DEFAULT_NAMES[color] ?? color,
        enabled: entry?.enabled ?? true,
      };
    });
    reply.send(result);
  });

  app.put('/api/products/:productId/color-legend', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const entries = req.body as { colorKey: string; name: string; enabled: boolean }[];
    if (!Array.isArray(entries)) return reply.status(400).send({ error: 'Expected array' });

    await Promise.all(entries.map((e) =>
      prisma.colorLegendEntry.upsert({
        where: { productId_colorKey: { productId, colorKey: e.colorKey } },
        create: { productId, colorKey: e.colorKey, name: e.name, enabled: e.enabled },
        update: { name: e.name, enabled: e.enabled },
      })
    ));
    reply.send({ ok: true });
  });
}
