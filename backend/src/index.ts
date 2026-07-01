// Validate env before anything else
import './config/env';
import { config } from './config/env';

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { authRoutes } from './routes/auth';
import { passwordResetRoutes } from './routes/password-reset';
import { userRoutes } from './routes/users';
import { teamRoutes } from './routes/teams';
import { accessRequestRoutes } from './routes/access-requests';
import { productRoutes } from './routes/products';
import { taskRoutes } from './routes/tasks';
import { milestoneRoutes } from './routes/milestones';
import { columnRoutes } from './routes/columns';
import { seedRoutes } from './routes/seed';
import { connectionRoutes } from './routes/connections';
import { colorLegendRoutes } from './routes/color-legend';
import { sprintRoutes } from './routes/sprints';
import { canvasSnapshotRoutes } from './routes/canvas-snapshots';
import { permissionRoutes } from './routes/permissions';
import { messageRoutes } from './routes/messages';
import { apiTokenRoutes } from './routes/api-tokens';
import { appRegistrationRoutes } from './routes/app-registrations';
import { notificationRoutes } from './routes/notifications';
import { webhookRoutes } from './routes/webhooks';
import { inviteRoutes } from './routes/invites';
import { exportRoutes } from './routes/export';
import { searchRoutes } from './routes/search';
import { realtimeRoutes } from './routes/realtime';
import { activityRoutes } from './routes/activity';
import { docsRoutes } from './routes/docs';
import { emailStatusRoutes } from './routes/email-status';
import { ssoRoutes } from './routes/sso';
import { analyticsRoutes } from './routes/analytics';
import { adminRoutes } from './routes/admin';
import { csrfCheck } from './middleware/csrf';

import websocket from '@fastify/websocket';
import prisma from './db/client';

async function applyAdminFlags() {
  if (!config.admin.email) return;
  const adminEmail = config.admin.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) return; // Will be applied on first registration
  if (!user.isAdmin || !user.isFoundingAdmin) {
    await prisma.user.update({ where: { email: adminEmail }, data: { isAdmin: true, isFoundingAdmin: true } });
    console.log(`[admin] Founding admin flags applied to ${adminEmail}`);
  }
}

async function main() {
  await applyAdminFlags();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      serializers: {
        req(req) {
          return { method: req.method, url: req.url, remoteAddress: req.socket?.remoteAddress };
        },
      },
    },
  });

  await app.register(cors, {
    origin: config.frontendOrigin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(websocket);

  // CSRF protection via Origin header check (allows non-browser API token callers)
  app.addHook('preHandler', csrfCheck);

  // Rate limiting — global defaults
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      error: 'Too many requests',
      retryAfter: context.after,
    }),
  });

  // Stricter limits on auth endpoints (applied per-route via plugin config override)
  // These routes self-register with tighter limits using addHook / config
  await app.register(authRoutes);
  await app.register(passwordResetRoutes);

  // Override rate limit for sensitive auth endpoints
  app.addHook('onRoute', (route) => {
    if (route.url && ['/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password'].includes(route.url)) {
      (route as any).config = { rateLimit: { max: 10, timeWindow: '1 minute' } };
    }
  });

  await app.register(apiTokenRoutes);
  await app.register(appRegistrationRoutes);
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(accessRequestRoutes);
  await app.register(productRoutes);
  await app.register(taskRoutes);
  await app.register(milestoneRoutes);
  await app.register(columnRoutes);
  await app.register(seedRoutes);
  await app.register(connectionRoutes);
  await app.register(colorLegendRoutes);
  await app.register(sprintRoutes);
  await app.register(canvasSnapshotRoutes);
  await app.register(permissionRoutes);
  await app.register(messageRoutes);
  await app.register(notificationRoutes);
  await app.register(webhookRoutes);
  await app.register(inviteRoutes);
  await app.register(exportRoutes);
  await app.register(searchRoutes);
  await app.register(realtimeRoutes);
  await app.register(activityRoutes);
  await app.register(docsRoutes);
  await app.register(emailStatusRoutes);
  await app.register(ssoRoutes);
  await app.register(analyticsRoutes);
  await app.register(adminRoutes);

  // Health check — verifies DB connection
  app.get('/api/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      reply.send({ ok: true, db: 'connected', uptime: process.uptime() });
    } catch {
      reply.status(503).send({ ok: false, db: 'disconnected' });
    }
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
