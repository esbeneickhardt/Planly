/**
 * Planly backend entrypoint — bootstraps the Fastify application.
 *
 * Startup sequence:
 *   1. Validate required environment variables (exits with clear error if missing)
 *   2. Run database startup tasks: emergency crown transfer, ensure admin account
 *   3. Register plugins: helmet, CORS, cookie, WebSocket, rate limiting
 *   4. Register global hooks: request ID, Content-Type guard, CSRF, IP restrictions, rate limits
 *   5. Register all route plugins
 *   6. Start listening
 *   7. Schedule the nightly data-retention cleanup job
 */

// Validate env before anything else
import './config/env';
import { config } from './config/env';

// Fastify core and plugins
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';

// Auth routes
import { authRoutes } from './routes/auth';
import { passwordResetRoutes } from './routes/password-reset';
import { totpRoutes } from './routes/totp';
import { ssoRoutes } from './routes/sso';

// User and team management routes
import { userRoutes } from './routes/users';
import { teamRoutes } from './routes/teams';
import { accessRequestRoutes } from './routes/access-requests';
import { inviteRoutes } from './routes/invites';

// Project (product) and content routes
import { productRoutes } from './routes/products';
import { taskRoutes } from './routes/tasks';
import { milestoneRoutes } from './routes/milestones';
import { columnRoutes } from './routes/columns';
import { connectionRoutes } from './routes/connections';
import { colorLegendRoutes } from './routes/color-legend';
import { sprintRoutes } from './routes/sprints';
import { canvasSnapshotRoutes } from './routes/canvas-snapshots';
import { permissionRoutes } from './routes/permissions';
import { messageRoutes } from './routes/messages';

// API access and integrations
import { apiTokenRoutes } from './routes/api-tokens';
import { appRegistrationRoutes } from './routes/app-registrations';
import { webhookRoutes } from './routes/webhooks';

// Notifications, search, and activity
import { notificationRoutes } from './routes/notifications';
import { searchRoutes } from './routes/search';
import { activityRoutes } from './routes/activity';
import { analyticsRoutes } from './routes/analytics';
import { announcementRoutes } from './routes/announcements';

// Export and calendar
import { exportRoutes } from './routes/export';
import { meExportRoutes } from './routes/me-export';
import { icalRoutes } from './routes/ical';

// Realtime (WebSocket)
import { realtimeRoutes } from './routes/realtime';
import { wsConnectionCount } from './realtime/manager';

// Integrations
import { githubRoutes } from './routes/github';

// Admin
import { adminRoutes } from './routes/admin';
import { adminChatRoutes } from './routes/admin-chat';
import { emailStatusRoutes } from './routes/email-status';
import { ipRestrictionRoutes, matchesCidr, getClientIp } from './routes/ip-restrictions';

// Docs and middleware
import { docsRoutes } from './docs/openapi';
import { csrfCheck } from './middleware/csrf';
import { seedRoutes } from './routes/seed';

// Node.js built-ins and database
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
      process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: 'admin flag restored', email: adminEmail }) + '\n');
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
    process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: 'founding admin created', email: adminEmail, source: 'ADMIN_PASSWORD env var' }) + '\n');
  } else {
    // Write banner as structured JSON so log aggregators capture it, but keep it readable
    const lines = [
      '╔══════════════════════════════════════════╗',
      '║   Founding admin account created         ║',
      `║   Email:    ${adminEmail.padEnd(29)}║`,
      `║   Password: ${initialPassword.padEnd(29)}║`,
      '║   You will be prompted to change it      ║',
      '║   on first login.                        ║',
      '╚══════════════════════════════════════════╝',
    ];
    lines.forEach((line) => process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: line }) + '\n'));
  }
}

async function emergencyRecrown() {
  const email = (process.env.RECROWN_EMAIL ?? '').toLowerCase().trim();
  if (!email) return;

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) {
    process.stderr.write(JSON.stringify({ level: 50, time: Date.now(), msg: 'RECROWN_EMAIL set but user not found — skipping', email }) + '\n');
    return;
  }

  await prisma.$transaction([
    prisma.user.updateMany({ where: { isFoundingAdmin: true }, data: { isFoundingAdmin: false } }),
    prisma.user.update({ where: { email }, data: { isAdmin: true, isFoundingAdmin: true } }),
    prisma.adminLog.create({ data: { action: 'CROWN_TRANSFERRED', actorName: 'SYSTEM (RECROWN_EMAIL)', targetName: target.username, metadata: { reason: 'Emergency recovery via RECROWN_EMAIL env var' } } }),
  ]);

  const rcrownLines = [
    '╔══════════════════════════════════════════╗',
    '║   EMERGENCY CROWN TRANSFER COMPLETE      ║',
    `║   New founding admin: ${email.padEnd(19)}║`,
    '║   Remove RECROWN_EMAIL from your env     ║',
    '║   and restart to clear this message.     ║',
    '╚══════════════════════════════════════════╝',
  ];
  rcrownLines.forEach((line) => process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: line, event: 'recrown' }) + '\n'));
}

const metrics = {
  requestsTotal: 0 as number,
  requestsByStatus: {} as Record<string, number>,
  startTime: Date.now(),
};

async function main() {
  await emergencyRecrown();
  await ensureAdminAccount();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      ...(process.env.LOG_FORMAT === 'pretty'
        ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } } }
        : {}),
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
  app.addHook('onResponse', (_req, reply, done) => {
    metrics.requestsTotal++;
    const bucket = String(Math.floor(reply.statusCode / 100) * 100);
    metrics.requestsByStatus[bucket] = (metrics.requestsByStatus[bucket] ?? 0) + 1;
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

  // Per-route rate limit overrides. Lookup table: url → { max, timeWindow }.
  // Auth endpoints use much tighter limits to resist brute force and enumeration.
  // Expensive read endpoints (search, exports) use tighter limits to resist scraping.
  const ROUTE_RATE_LIMITS: Record<string, { max: number; timeWindow: string }> = {
    '/api/auth/login':                   { max: 10, timeWindow: '1 minute' },
    '/api/auth/forgot-password':         { max: 10, timeWindow: '1 minute' },
    '/api/auth/reset-password':          { max: 10, timeWindow: '1 minute' },
    '/api/auth/change-password':         { max: 5,  timeWindow: '15 minutes' },
    '/api/auth/resend-verification':     { max: 5,  timeWindow: '15 minutes' },
    '/api/auth/register':                { max: 10, timeWindow: '1 hour' },
    '/api/search':                       { max: 30, timeWindow: '1 minute' },
    '/api/admin/logs/export':            { max: 10, timeWindow: '1 minute' },
    '/api/me/export':                    { max: 5,  timeWindow: '1 hour' },
  };

  app.addHook('onRoute', (route) => {
    if (!route.url) return;
    const limit = ROUTE_RATE_LIMITS[route.url];
    if (!limit) return;
    type RouteWithConfig = typeof route & { config?: { rateLimit?: { max: number; timeWindow: string } } };
    (route as RouteWithConfig).config = { rateLimit: limit };
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
  await app.register(githubRoutes);
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

  app.get('/api/health/ready', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      reply.send({ ready: true, uptime: process.uptime() });
    } catch (err) {
      reply.status(503).send({ ready: false, reason: 'database unreachable' });
    }
  });

  app.get('/api/metrics', async (req, reply) => {
    const secret = process.env.METRICS_SECRET;
    if (secret) {
      const provided = req.headers['x-metrics-secret'];
      if (provided !== secret) return reply.status(401).send('Unauthorized');
    }
    const uptimeSec = (Date.now() - metrics.startTime) / 1000;
    const wsConns = wsConnectionCount();
    const lines = [
      '# HELP process_uptime_seconds Server uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptimeSec.toFixed(2)}`,
      '# HELP http_requests_total Total HTTP requests handled',
      '# TYPE http_requests_total counter',
      `http_requests_total ${metrics.requestsTotal}`,
      ...Object.entries(metrics.requestsByStatus).map(
        ([bucket, count]) => `http_requests_by_status_total{status="${bucket}"} ${count}`,
      ),
      '# HELP ws_connections_active Active WebSocket connections',
      '# TYPE ws_connections_active gauge',
      `ws_connections_active ${wsConns}`,
      '',
    ].join('\n');
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(lines);
  });

  // Scheduled data-retention cleanup (runs once at startup then every 24h)
  async function runRetentionCleanup() {
    try {
      const notifCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const activityCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const softDeleteCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const adminLogRetentionDays = parseInt(process.env.ADMIN_LOG_RETENTION_DAYS ?? '365', 10);
      const adminLogCutoff = new Date(Date.now() - adminLogRetentionDays * 24 * 60 * 60 * 1000);
      const [notifResult, activityResult, taskResult, adminLogResult, ssoStateResult] = await Promise.all([
        prisma.notification.deleteMany({ where: { createdAt: { lt: notifCutoff } } }),
        prisma.activityEvent.deleteMany({ where: { createdAt: { lt: activityCutoff } } }),
        prisma.task.deleteMany({ where: { deletedAt: { lt: softDeleteCutoff } } }),
        prisma.adminLog.deleteMany({ where: { createdAt: { lt: adminLogCutoff } } }),
        prisma.ssoState.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
        prisma.wsTicket.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      ]);
      if (notifResult.count > 0 || activityResult.count > 0 || taskResult.count > 0 || adminLogResult.count > 0 || ssoStateResult.count > 0) {
        app.log.info({ notificationsDeleted: notifResult.count, activityEventsDeleted: activityResult.count, tasksHardDeleted: taskResult.count, adminLogsDeleted: adminLogResult.count, ssoStatesDeleted: ssoStateResult.count }, 'Retention cleanup completed');
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
