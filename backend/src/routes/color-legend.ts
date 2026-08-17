/**
 * Color legend routes - manage the per-project label color mapping used to
 * visually categorize tasks on the Kanban board and other views.
 *
 * The legend is a list of { colorKey, label } entries. Co-owners define the legend;
 * all project members can read it. Tasks reference colorKeys to display their label color.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireProductMember, requireProductCoOwner } from '../utils/product-guard';
import { validate } from '../utils/validate';

// The fixed set of color keys supported by the system; colorKey values must be in this list
const PRESET_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316'];

// Validates the full legend payload: an array of entries capped to the preset palette size
const colorLegendSchema = z
  .array(
    z.object({
      colorKey: z.string(),
      name: z.string().min(1).max(50),
      enabled: z.boolean(),
    }),
  )
  .max(PRESET_COLORS.length);

// Fallback labels shown when a project has never customized its legend entries
const DEFAULT_NAMES: Record<string, string> = {
  '#7c3aed': 'Feature',
  '#3b82f6': 'Bug',
  '#10b981': 'Enhancement',
  '#f59e0b': 'Milestone',
  '#ef4444': 'Blocker',
  '#ec4899': 'Design',
  '#06b6d4': 'Infrastructure',
  '#f97316': 'Research',
};

export async function colorLegendRoutes(app: FastifyInstance) {
  // Get the color legend, merging DB entries with defaults for uncustomized keys
  app.get('/api/products/:productId/color-legend', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductMember(productId, req.user, reply))) return;
    const entries = await prisma.colorLegendEntry.findMany({
      where: { productId },
    });
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

  // Replace the full color legend (co-owner only)
  app.put('/api/products/:productId/color-legend', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    if (!(await requireProductCoOwner(productId, req.user.userId, reply))) return;
    const entries = validate(colorLegendSchema, req.body, reply);
    if (!entries) return;

    // Validate all submitted colorKeys are in the preset palette
    for (const e of entries) {
      if (!PRESET_COLORS.includes(e.colorKey))
        return reply.status(400).send({ error: `Invalid colorKey: ${e.colorKey}` });
    }

    // Upsert each entry
    await Promise.all(
      entries.map((e) =>
        prisma.colorLegendEntry.upsert({
          where: { productId_colorKey: { productId, colorKey: e.colorKey } },
          create: {
            productId,
            colorKey: e.colorKey,
            name: e.name,
            enabled: e.enabled,
          },
          update: { name: e.name, enabled: e.enabled },
        }),
      ),
    );
    reply.send({ ok: true });
  });
}
