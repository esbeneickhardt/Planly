// Validate env before anything else
import './config/env';
import { config } from './config/env';

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';

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
import { meExportRoutes } from './routes/me-export';
import { searchRoutes } from './routes/search';
import { realtimeRoutes } from './routes/realtime';
import { activityRoutes } from './routes/activity';
import { docsRoutes } from './routes/docs';
import { emailStatusRoutes } from './routes/email-status';
import { totpRoutes } from './routes/totp';
import { ssoRoutes } from './routes/sso';
import { analyticsRoutes } from './routes/analytics';
import { adminRoutes } from './routes/admin';
import { adminChatRoutes } from './routes/admin-chat';
import { announcementRoutes } from './routes/announcements';
import { ipRestrictionRoutes, matchesCidr, getClientIp } from './routes/ip-restrictions';
import { icalRoutes } from './routes/ical';
import { csrfCheck } from './middleware/csrf';

import websocket from '@fastify/websocket';
import prisma from './db/client';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

async function ensureAdminAccount() {
  if (!config.admin.email) return;
  const adminEmail = config.admin.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    // ADMIN_EMAIL guarantees admin access only - never touch isFoundingAdmin on an existing account.
    // The founding-admin seat belongs to whoever holds it in the DB (managed via Transfer Ownership).
    if (!existing.isAdmin) {
      await prisma.user.update({ where: { email: adminEmail }, data: { isAdmin: true } });
      console.log(`[admin] Admin flag restored for ${adminEmail}`);
    }
    return;
  }

  // Account doesn't exist - create it now so no one else can claim the email
  const useEnvPassword = !!config.admin.password;
  const initialPassword = useEnvPassword ? config.admin.password : randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  const base = (adminEmail.split('@')[0] ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'admin';
  let username = base;
  let suffix = 0;
  while (await prisma.user.findUnique({ where: { username } })) username = `${base}${++suffix}`;

  await prisma.user.create({
    data: {
      email: adminEmail,
      username,
      passwordHash,
      isAdmin: true,
      isFoundingAdmin: true,
      emailVerified: true,
      mustChangePassword: !useEnvPassword, // force change only when password was auto-generated
    },
  });

  if (useEnvPassword) {
    console.log(`[admin] Founding admin account created: ${adminEmail} (password from ADMIN_PASSWORD env var)`);
  } else {
    console.log('');
    console.log('[admin] ╔══════════════════════════════════════════╗');
    console.log('[admin] ║   Founding admin account created         ║');
    console.log(`[admin] ║   Email:    ${adminEmail.padEnd(29)}║`);
    console.log(`[admin] ║   Password: ${initialPassword.padEnd(29)}║`);
    console.log('[admin] ║   You will be prompted to change it      ║');
    console.log('[admin] ║   on first login.                        ║');
    console.log('[admin] ╚══════════════════════════════════════════╝');
    console.log('');
  }
}

async function emergencyRecrown() {
  const email = (process.env.RECROWN_EMAIL ?? '').toLowerCase().trim();
  if (!email) return;

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) {
    console.error(`[recrown] RECROWN_EMAIL is set but no user with email "${email}" was found - skipping.`);
    return;
  }

  await prisma.$transaction([
    prisma.user.updateMany({ where: { isFoundingAdmin: true }, data: { isFoundingAdmin: false } }),
    prisma.user.update({ where: { email }, data: { isAdmin: true, isFoundingAdmin: true } }),
    prisma.adminLog.create({ data: { action: 'CROWN_TRANSFERRED', actorName: 'SYSTEM (RECROWN_EMAIL)', targetName: target.username, metadata: { reason: 'Emergency recovery via RECROWN_EMAIL env var' } } }),
  ]);

  console.log('');
  console.log('[recrown] ╔══════════════════════════════════════════╗');
  console.log('[recrown] ║   EMERGENCY CROWN TRANSFER COMPLETE      ║');
  console.log(`[recrown] ║   New founding admin: ${email.padEnd(19)}║`);
  console.log('[recrown] ║   Remove RECROWN_EMAIL from your env     ║');
  console.log('[recrown] ║   and restart to clear this message.     ║');
  console.log('[recrown] ╚══════════════════════════════════════════╝');
  console.log('');
}

async function main() {
  await emergencyRecrown();
  await ensureAdminAccount();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      serializers: {
        req(req) {
          const safeUrl = req.url.replace(/([?&])token=[^&]*/g, '$1token=[redacted]');
          return { method: req.method, url: safeUrl, remoteAddress: req.socket?.remoteAddress };
        },
      },
    },
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  });

  // Prevent stack traces and internal Prisma error details from leaking to clients
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    req.log.error({ err, requestId: req.id }, 'Unhandled error');
    const status = err.statusCode ?? reply.statusCode;
    if (!status || status >= 500) {
      reply.status(500).send({ error: 'Internal server error', requestId: req.id });
    } else {
      reply.status(status).send({ error: err.message });
    }
  });

  // Attach a request-ID to every request and echo it back in the response.
  // Frontend can log the X-Request-Id header to correlate errors with server logs.
  app.addHook('onRequest', (req, _reply, done) => {
    const incoming = req.headers['x-request-id'];
    const raw = (Array.isArray(incoming) ? incoming[0] : incoming) ?? '';
    // Strip control characters to prevent log injection
    const sanitized = raw.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64);
    req.id = sanitized || randomUUID();
    done();
  });
  app.addHook('onSend', (_req, reply, _payload, done) => {
    reply.header('X-Request-Id', _req.id as string);
    const ct = reply.getHeader('content-type');
    if (ct && typeof ct === 'string' && ct.includes('text/html')) {
      reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'");
    }
    done();
  });

  await app.register(cors, {
    origin: config.frontendOrigin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(websocket);

  // CSRF protection via Origin header check (allows non-browser API token callers)
  app.addHook('preHandler', csrfCheck);

  // Reject requests whose Content-Type header contains a tab character.
  // Tab chars in Content-Type caused Fastify ≤4 to skip body parsing, bypassing
  // JSON schema validation. Fastify 5 fixed this, but we keep the guard as defence-in-depth.
  app.addHook('onRequest', (req, reply, done) => {
    const ct = req.headers['content-type'];
    if (ct && ct.includes('\t')) {
      reply.status(400).send({ error: 'Malformed Content-Type header' });
      return;
    }
    done();
  });

  // Note: scoped PAT enforcement is handled atomically inside validateToken in auth.ts
  // (a global preHandler hook cannot do this because req.user is not yet populated at that point)

  // IP restriction check - runs before every request
  app.addHook('preHandler', async (req, reply) => {
    // Never block the management endpoint itself (so admins can always fix config)
    if (req.url.startsWith('/api/admin/ip-restrictions')) return;

    const config = await prisma.serverConfig.findUnique({ where: { id: 'main' }, select: { ipRestrictionMode: true } });
    const mode = config?.ipRestrictionMode ?? 'disabled';
    if (mode === 'disabled') return;

    const ip = getClientIp(req as never);
    // Always allow localhost / container-internal traffic
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return;

    const rules = await prisma.ipRestriction.findMany({ select: { cidr: true } });
    const matches = rules.some((r) => matchesCidr(ip, r.cidr));

    if (mode === 'allowlist' && !matches) {
      return reply.status(403).send({ error: 'Access denied: your IP address is not on the allowlist.', code: 'IP_BLOCKED' });
    }
    if (mode === 'blocklist' && matches) {
      return reply.status(403).send({ error: 'Access denied: your IP address has been blocked.', code: 'IP_BLOCKED' });
    }
  });

  // Rate limiting - global defaults
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      error: 'Too many requests',
      retryAfter: context.after,
    }),
  });

  // Stricter limits on sensitive auth endpoints — hook must be registered BEFORE the routes
  app.addHook('onRoute', (route) => {
    if (route.url && ['/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password'].includes(route.url)) {
      (route as any).config = { rateLimit: { max: 10, timeWindow: '1 minute' } };
    }
    if (route.url === '/api/auth/change-password') {
      (route as any).config = { rateLimit: { max: 5, timeWindow: '15 minutes' } };
    }
    if (route.url === '/api/auth/resend-verification') {
      (route as any).config = { rateLimit: { max: 5, timeWindow: '15 minutes' } };
    }
  });

  await app.register(authRoutes);
  await app.register(passwordResetRoutes);

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
  await app.register(meExportRoutes);
  await app.register(searchRoutes);
  await app.register(realtimeRoutes);
  await app.register(activityRoutes);
  await app.register(docsRoutes);
  await app.register(emailStatusRoutes);
  await app.register(totpRoutes);
  await app.register(ssoRoutes);
  await app.register(analyticsRoutes);
  await app.register(adminRoutes);
  await app.register(adminChatRoutes);
  await app.register(announcementRoutes);
  await app.register(ipRestrictionRoutes);
  await app.register(icalRoutes);

  // Health check - verifies DB connection
  app.get('/api/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      reply.send({ ok: true, db: 'connected', uptime: process.uptime() });
    } catch {
      reply.status(503).send({ ok: false, db: 'disconnected' });
    }
  });

  // Scheduled data-retention cleanup (runs once at startup then every 24h)
  async function runRetentionCleanup() {
    try {
      const notifCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const activityCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const softDeleteCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const adminLogRetentionDays = parseInt(process.env.ADMIN_LOG_RETENTION_DAYS ?? '365', 10);
      const adminLogCutoff = new Date(Date.now() - adminLogRetentionDays * 24 * 60 * 60 * 1000);
      const [notifResult, activityResult, taskResult, adminLogResult] = await Promise.all([
        prisma.notification.deleteMany({ where: { createdAt: { lt: notifCutoff } } }),
        prisma.activityEvent.deleteMany({ where: { createdAt: { lt: activityCutoff } } }),
        prisma.task.deleteMany({ where: { deletedAt: { lt: softDeleteCutoff } } }),
        prisma.adminLog.deleteMany({ where: { createdAt: { lt: adminLogCutoff } } }),
      ]);
      if (notifResult.count > 0 || activityResult.count > 0 || taskResult.count > 0 || adminLogResult.count > 0) {
        app.log.info({ notificationsDeleted: notifResult.count, activityEventsDeleted: activityResult.count, tasksHardDeleted: taskResult.count, adminLogsDeleted: adminLogResult.count }, 'Retention cleanup completed');
      }
    } catch (err) {
      app.log.warn({ err }, 'Retention cleanup failed');
    }
  }
  // Run at startup (after a short delay to avoid DB contention at boot)
  setTimeout(() => {
    runRetentionCleanup();
    setInterval(runRetentionCleanup, 24 * 60 * 60 * 1000);
  }, 30_000);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
