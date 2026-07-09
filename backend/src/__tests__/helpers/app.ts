/**
 * Builds a Fastify app instance for integration tests.
 * Uses app.inject() instead of starting a real TCP server.
 *
 * Requires TEST_DATABASE_URL (or DATABASE_URL) to point to a reachable
 * PostgreSQL database that has the Planly schema applied.
 * Spin one up with: docker compose -f docker-compose.yml -f docker-compose.test.yml up -d db
 */
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { authRoutes } from '../../routes/auth';
import { passwordResetRoutes } from '../../routes/password-reset';
import { totpRoutes } from '../../routes/totp';
import { userRoutes } from '../../routes/users';
import { productRoutes } from '../../routes/products';
import { taskRoutes } from '../../routes/tasks';
import { teamRoutes } from '../../routes/teams';
import { webhookRoutes } from '../../routes/webhooks';
import { exportRoutes } from '../../routes/export';
import { announcementRoutes } from '../../routes/announcements';
import { adminRoutes } from '../../routes/admin';
import { sprintRoutes } from '../../routes/sprints';
import { columnRoutes } from '../../routes/columns';
import { colorLegendRoutes } from '../../routes/color-legend';
import { canvasSnapshotRoutes } from '../../routes/canvas-snapshots';
import { searchRoutes } from '../../routes/search';
import { apiTokenRoutes } from '../../routes/api-tokens';
import { appRegistrationRoutes } from '../../routes/app-registrations';
import { permissionRoutes } from '../../routes/permissions';
import { messageRoutes } from '../../routes/messages';
export async function buildTestApp(opts: { rateLimitMax?: number } = {}) {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: 'http://localhost:5173', credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: opts.rateLimitMax ?? 10000, timeWindow: '1 minute' });

  await app.register(authRoutes);
  await app.register(passwordResetRoutes);
  await app.register(totpRoutes);
  await app.register(adminRoutes);
  await app.register(userRoutes);
  await app.register(productRoutes);
  await app.register(taskRoutes);
  await app.register(teamRoutes);
  await app.register(webhookRoutes);
  await app.register(exportRoutes);
  await app.register(announcementRoutes);
  await app.register(sprintRoutes);
  await app.register(columnRoutes);
  await app.register(colorLegendRoutes);
  await app.register(canvasSnapshotRoutes);
  await app.register(searchRoutes);
  await app.register(apiTokenRoutes);
  await app.register(appRegistrationRoutes);
  await app.register(permissionRoutes);
  await app.register(messageRoutes);

  await app.ready();
  return app;
}
