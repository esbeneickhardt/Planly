/**
 * Admin routes barrel — registers all admin sub-plugins.
 *
 * Split into:
 *   admin/users.ts  — user management (promote, demote, unlock, delete, crown transfer)
 *   admin/config.ts — server config + email whitelist
 *   admin/stats.ts  — server-wide stats + project listing
 *   admin/logs.ts   — audit log queries, export, prune, and admin notifications
 */
import { FastifyInstance } from 'fastify';
import { adminUserRoutes } from './admin/users';
import { adminConfigRoutes } from './admin/config';
import { adminStatsRoutes } from './admin/stats';
import { adminLogRoutes } from './admin/logs';

export async function adminRoutes(app: FastifyInstance) {
  await app.register(adminUserRoutes);
  await app.register(adminConfigRoutes);
  await app.register(adminStatsRoutes);
  await app.register(adminLogRoutes);
}
