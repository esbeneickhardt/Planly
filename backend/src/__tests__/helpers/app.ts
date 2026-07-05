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
import { userRoutes } from '../../routes/users';
import { productRoutes } from '../../routes/products';
import { taskRoutes } from '../../routes/tasks';
import { teamRoutes } from '../../routes/teams';
import { webhookRoutes } from '../../routes/webhooks';
import { exportRoutes } from '../../routes/export';
import { announcementRoutes } from '../../routes/announcements';
import { csrfCheck } from '../../middleware/csrf';

export async function buildTestApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: 'http://localhost:5173', credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 10000, timeWindow: '1 minute' });

  app.addHook('preHandler', csrfCheck);

  await app.register(authRoutes);
  await app.register(passwordResetRoutes);
  await app.register(userRoutes);
  await app.register(productRoutes);
  await app.register(taskRoutes);
  await app.register(teamRoutes);
  await app.register(webhookRoutes);
  await app.register(exportRoutes);
  await app.register(announcementRoutes);

  await app.ready();
  return app;
}
