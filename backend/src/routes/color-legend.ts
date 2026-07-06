import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireProductCoOwner } from '../utils/product-guard';

const PRESET_COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];
const colorLegendSchema = z.array(z.object({
  colorKey: z.string(),
  name: z.string().min(1).max(50),
  enabled: z.boolean(),
})).max(PRESET_COLORS.length);
const DEFAULT_NAMES: Record<string, string> = {
  '#7c3aed': 'Feature', '#3b82f6': 'Bug', '#10b981': 'Enhancement',
  '#f59e0b': 'Milestone', '#ef4444': 'Blocker', '#ec4899': 'Design',
  '#06b6d4': 'Infrastructure', '#f97316': 'Research',
};

export async function colorLegendRoutes(app: FastifyInstance) {
  app.get('/api/products/:productId/color-legend', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductMember(productId, req.user.userId, reply)) return;
    const entries = await prisma.colorLegendEntry.findMany({ where: { productId } });
    const entryMap = new Map(entries.map((e) => [e.colorKey, e]));
    const result = PRESET_COLORS.map((color) => {
      const entry = entryMap.get(color);
      return { colorKey: color, name: entry?.name ?? DEFAULT_NAMES[color] ?? color, enabled: entry?.enabled ?? true };
    });
    reply.send(result);
  });

  app.put('/api/products/:productId/color-legend', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!await requireProductCoOwner(productId, req.user.userId, reply)) return;
    const parsed = colorLegendSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const entries = parsed.data;
    for (const e of entries) {
      if (!PRESET_COLORS.includes(e.colorKey)) return reply.status(400).send({ error: `Invalid colorKey: ${e.colorKey}` });
    }

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
