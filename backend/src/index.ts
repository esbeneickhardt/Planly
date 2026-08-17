/**
 * Planly backend entrypoint - bootstraps the Fastify application.
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
import { conversationRoutes } from './routes/conversations';
import { emailStatusRoutes } from './routes/email-status';
import { ipRestrictionRoutes, matchesCidr, getClientIp } from './routes/ip-restrictions';

// Docs and middleware
import { docsRoutes } from './docs/openapi';
import { csrfCheck } from './middleware/csrf';
import { seedRoutes } from './routes/seed';

// Node.js built-ins and database
import prisma from './db/client';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, createHash } from 'crypto';
import jwt from 'jsonwebtoken';

// Ensures a server admin account exists for ADMIN_EMAIL; creates one on first start, restores
// the isAdmin flag if it was revoked
async function ensureAdminAccount() {
  if (!config.admin.email) return;
  const adminEmail = config.admin.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    // ADMIN_EMAIL guarantees admin access only - never touch isFoundingAdmin on an existing account.
    // The founding-admin seat belongs to whoever holds it in the DB (managed via Transfer Ownership).
    if (!existing.isAdmin) {
      await prisma.user.update({ where: { email: adminEmail }, data: { isAdmin: true } });
      process.stdout.write(
        JSON.stringify({ level: 30, time: Date.now(), msg: 'admin flag restored', email: adminEmail }) + '\n',
      );
    }
    return;
  }

  // Account doesn't exist - create it now so no one else can claim the email
  const useEnvPassword = !!config.admin.password;
  const initialPassword = useEnvPassword ? config.admin.password : randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  // Derive a username from the email local-part. If someone has already claimed it, append a
  // numeric suffix - this is cosmetic only; admin rights come from isFoundingAdmin, not the username.
  const base =
    (adminEmail.split('@')[0] ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 32) || 'admin';
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
    process.stdout.write(
      JSON.stringify({
        level: 30,
        time: Date.now(),
        msg: 'founding admin created',
        email: adminEmail,
        source: 'ADMIN_PASSWORD env var',
      }) + '\n',
    );
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

// Transfers the founding-admin crown to RECROWN_EMAIL if set - use when the current founding admin is unavailable
async function emergencyRecrown() {
  const email = (process.env.RECROWN_EMAIL ?? '').toLowerCase().trim();
  if (!email) return;

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) {
    process.stderr.write(
      JSON.stringify({ level: 50, time: Date.now(), msg: 'RECROWN_EMAIL set but user not found - skipping', email }) +
        '\n',
    );
    return;
  }

  // Atomically strip the existing crown and grant it to the target so there is
  // never a moment with zero founding admins; also writes an audit trail entry
  await prisma.$transaction([
    prisma.user.updateMany({ where: { isFoundingAdmin: true }, data: { isFoundingAdmin: false } }),
    prisma.user.update({ where: { email }, data: { isAdmin: true, isFoundingAdmin: true } }),
    prisma.adminLog.create({
      data: {
        action: 'CROWN_TRANSFERRED',
        actorName: 'SYSTEM (RECROWN_EMAIL)',
        targetName: target.username,
        metadata: { reason: 'Emergency recovery via RECROWN_EMAIL env var' },
      },
    }),
  ]);

  const rcrownLines = [
    '╔══════════════════════════════════════════╗',
    '║   EMERGENCY CROWN TRANSFER COMPLETE      ║',
    `║   New founding admin: ${email.padEnd(19)}║`,
    '║   Remove RECROWN_EMAIL from your env     ║',
    '║   and restart to clear this message.     ║',
    '╚══════════════════════════════════════════╝',
  ];
  rcrownLines.forEach((line) =>
    process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: line, event: 'recrown' }) + '\n'),
  );
}

// In-memory counters for /api/metrics - avoids a DB query on every Prometheus scrape
const metrics = {
  requestsTotal: 0 as number,
  requestsByStatus: {} as Record<string, number>,
  startTime: Date.now(),
};

// Bootstraps the Fastify app: runs startup tasks, registers all plugins and routes, then starts listening
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

  // Content-Security-Policy (CSP) is a browser security header that restricts which scripts, styles,
  // and images the browser is allowed to load - a key defence against cross-site scripting (XSS).
  // Helmet's global CSP is disabled here because:
  //   • API responses are JSON - browsers never execute them, so a CSP header is meaningless.
  //   • The React frontend is served by Nginx, which sets its own CSP for those HTML/JS/CSS files.
  // The only HTML this server ever returns is Fastify error pages; those get a narrow CSP in the onSend hook below.
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
    // eslint-disable-next-line no-control-regex
    const sanitized = raw.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64);
    req.id = sanitized || randomUUID();
    done();
  });

  // Update in-memory request counters used by /api/metrics
  app.addHook('onResponse', (_req, reply, done) => {
    metrics.requestsTotal++;
    const bucket = String(Math.floor(reply.statusCode / 100) * 100);
    metrics.requestsByStatus[bucket] = (metrics.requestsByStatus[bucket] ?? 0) + 1;
    done();
  });

  // Echo the request ID so the client can correlate errors with server logs;
  // also inject a narrow Content-Security-Policy (CSP) on any HTML responses (Fastify error pages only - the SPA is served by Nginx)
  app.addHook('onSend', (_req, reply, _payload, done) => {
    reply.header('X-Request-Id', _req.id as string);
    const ct = reply.getHeader('content-type');
    if (ct && typeof ct === 'string' && ct.includes('text/html')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'",
      );
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

  // Sec-Fetch-* header validation - defence-in-depth against CSRF.
  // Modern browsers attach these headers on every request and they cannot be forged by JS.
  // If Sec-Fetch-Site is present and says 'cross-site', reject non-GET/HEAD mutating requests.
  // Requests from API clients (curl, PATs, mobile) omit the header entirely and pass through.
  const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.addHook('onRequest', (req, reply, done) => {
    const site = req.headers['sec-fetch-site'];
    if (site && site === 'cross-site' && MUTATING_METHODS.has(req.method)) {
      // Allow the SSO callback which arrives as a cross-site navigation POST from the IdP
      if (req.url.startsWith('/api/auth/sso/callback')) {
        done();
        return;
      }
      reply.status(403).send({ error: 'Cross-site requests are not allowed' });
      return;
    }
    done();
  });

  // CSP violation reports from the browser - no auth, logged at warn level for review.
  // Violations appear when injected scripts or rogue resources are blocked by the CSP.
  // Set SECURITY_ALERT_WEBHOOK_URL to route high-frequency violations to Slack/Discord.
  app.addContentTypeParser('application/csp-report', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, {});
    }
  });
  app.post('/api/csp-report', async (req, reply) => {
    req.log.warn({ cspViolation: req.body }, 'CSP violation reported');
    reply.status(204).send();
  });

  // Note: scoped PAT enforcement is handled atomically inside validateToken in auth.ts
  // (a global preHandler hook cannot do this because req.user is not yet populated at that point)

  // IP restriction check - runs before every request
  app.addHook('preHandler', async (req, reply) => {
    // Never block the management endpoint itself (so admins can always fix config)
    if (req.url.startsWith('/api/admin/ip-restrictions')) return;
    // Allow login/logout so admins can get a session cookie; the admin bypass below
    // then exempts them on all subsequent requests. /api/auth/me and all other auth
    // endpoints are intentionally NOT exempt so non-admins can't slip through.
    if (req.url.startsWith('/api/auth/login') || req.url.startsWith('/api/auth/logout')) return;

    const ip = getClientIp(req as never);
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return;

    // Admins/server owners are governed by the separate admin IP rules, not these.
    const cookieToken = req.cookies?.token;
    if (cookieToken) {
      try {
        const payload = jwt.verify(cookieToken, config.jwtSecret, { algorithms: ['HS256'] }) as { userId?: string };
        if (payload.userId) {
          const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { isAdmin: true } });
          if (user?.isAdmin) return;
        }
      } catch {
        /* invalid / expired token - apply IP rules */
      }
    }

    const [allowlist, blocklist] = await Promise.all([
      prisma.ipRestriction.findMany({ where: { listType: 'allowlist' }, select: { cidr: true } }),
      prisma.ipRestriction.findMany({ where: { listType: 'blocklist' }, select: { cidr: true } }),
    ]);

    // Blocklist takes precedence over allowlist
    if (blocklist.some((r) => matchesCidr(ip, r.cidr))) {
      return reply.status(403).send({ error: 'Access denied: your IP address has been blocked.', code: 'IP_BLOCKED' });
    }
    // If an allowlist exists, the IP must be on it
    if (allowlist.length > 0 && !allowlist.some((r) => matchesCidr(ip, r.cidr))) {
      return reply
        .status(403)
        .send({ error: 'Access denied: your IP address is not on the allowlist.', code: 'IP_BLOCKED' });
    }
  });

  // Rate limiting - global defaults.
  // Keyed by authenticated principal (bearer token or session cookie) rather than raw IP, so a
  // PAT/App-Registration script hammering the API can only ever exhaust its own allowance - it
  // can never eat into the quota of an interactive browser session sharing the same IP (e.g. the
  // same dev machine, or many users behind one NAT/office IP). Unauthenticated requests (login,
  // registration) still fall back to IP, which is what those routes' tighter overrides expect.
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        return `bearer:${createHash('sha256').update(authHeader.slice(7)).digest('hex')}`;
      }
      const cookieToken = req.cookies?.token;
      if (cookieToken) {
        return `session:${createHash('sha256').update(cookieToken).digest('hex')}`;
      }
      return `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, context) => ({
      error: 'Too many requests',
      retryAfter: context.after,
    }),
  });

  // Per-route rate limit overrides. Lookup table: url → { max, timeWindow }.
  // Auth endpoints use much tighter limits to resist brute force and enumeration.
  // Expensive read endpoints (search, exports) use tighter limits to resist scraping.
  const loginRateMax = parseInt(process.env.RATE_LIMIT_LOGIN_MAX ?? '10', 10);
  const registerRateMax = parseInt(process.env.RATE_LIMIT_REGISTER_MAX ?? '10', 10);
  // Same order of magnitude as login: the TOTP challenge is an unauthenticated, guessable
  // 6-digit code with no rate limiting of its own otherwise (see totp.ts's progressive lockout
  // for the complementary per-account defense).
  const totpChallengeRateMax = parseInt(process.env.RATE_LIMIT_TOTP_MAX ?? '10', 10);
  const ROUTE_RATE_LIMITS: Record<string, { max: number; timeWindow: string }> = {
    '/api/auth/login': { max: loginRateMax, timeWindow: '1 minute' },
    '/api/auth/totp/challenge': { max: totpChallengeRateMax, timeWindow: '1 minute' },
    '/api/auth/refresh-token': { max: 60, timeWindow: '1 minute' },
    '/api/auth/forgot-password': { max: 10, timeWindow: '1 minute' },
    '/api/auth/reset-password': { max: 10, timeWindow: '1 minute' },
    '/api/auth/change-password': { max: 5, timeWindow: '15 minutes' },
    '/api/auth/resend-verification': { max: 5, timeWindow: '15 minutes' },
    '/api/auth/register': { max: registerRateMax, timeWindow: '1 hour' },
    '/api/search': { max: 30, timeWindow: '1 minute' },
    '/api/admin/logs/export': { max: 10, timeWindow: '1 minute' },
    '/api/me/export': { max: 5, timeWindow: '1 hour' },
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
  await app.register(conversationRoutes);
  await app.register(announcementRoutes);
  await app.register(ipRestrictionRoutes);
  await app.register(icalRoutes);

  // Public config - returns non-sensitive values needed by the frontend without authentication
  app.get('/api/config', async (_req, reply) => {
    reply.send({ contactEmail: config.contactEmail });
  });

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
    } catch {
      reply.status(503).send({ ready: false, reason: 'database unreachable' });
    }
  });

  // Prometheus-format metrics; always requires X-Metrics-Secret header (set METRICS_SECRET in .env)
  app.get('/api/metrics', async (req, reply) => {
    const secret = process.env.METRICS_SECRET;
    const provided = req.headers['x-metrics-secret'];
    if (!secret || provided !== secret) return reply.status(401).send('Unauthorized');
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

  // Purges old rows across several tables to keep the database lean; runs once at startup then every 24h
  async function runRetentionCleanup() {
    try {
      const notifCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // notifications: 90 days
      const activityCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // activity feed: 180 days
      const softDeleteCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // soft-deleted tasks: 1 year
      const adminLogRetentionDays = parseInt(process.env.ADMIN_LOG_RETENTION_DAYS ?? '90', 10);
      const adminLogCutoff = new Date(Date.now() - adminLogRetentionDays * 24 * 60 * 60 * 1000); // audit log: configurable (default 90d)
      const [notifResult, activityResult, taskResult, adminLogResult, ssoStateResult, wsTicketResult, refreshTokenResult] =
        await Promise.all([
          prisma.notification.deleteMany({ where: { createdAt: { lt: notifCutoff } } }),
          prisma.activityEvent.deleteMany({ where: { createdAt: { lt: activityCutoff } } }),
          prisma.task.deleteMany({ where: { deletedAt: { lt: softDeleteCutoff } } }), // hard-delete tasks soft-deleted over a year ago
          prisma.adminLog.deleteMany({ where: { createdAt: { lt: adminLogCutoff } } }),
          prisma.ssoState.deleteMany({ where: { expiresAt: { lt: new Date() } } }), // OIDC flow nonces (short-lived, expire on their own)
          prisma.wsTicket.deleteMany({ where: { expiresAt: { lt: new Date() } } }), // WebSocket auth tickets (short-lived, expire on their own)
          // Refresh tokens (see utils/refresh-tokens.ts for the rotation model): safe to delete once
          // either condition holds - expired (past its 30-day expiresAt, whether or not it was ever
          // rotated), or already superseded by a later rotation (rotatedAt set - kept around only for
          // reuse detection, which a token can no longer serve once its whole family has long since
          // moved on). A currently-live token (rotatedAt null, not yet expired) is never touched.
          prisma.refreshToken.deleteMany({
            where: { OR: [{ expiresAt: { lt: new Date() } }, { rotatedAt: { not: null } }] },
          }),
        ]);
      if (
        notifResult.count > 0 ||
        activityResult.count > 0 ||
        taskResult.count > 0 ||
        adminLogResult.count > 0 ||
        ssoStateResult.count > 0 ||
        wsTicketResult.count > 0 ||
        refreshTokenResult.count > 0
      ) {
        app.log.info(
          {
            notificationsDeleted: notifResult.count,
            activityEventsDeleted: activityResult.count,
            tasksHardDeleted: taskResult.count,
            adminLogsDeleted: adminLogResult.count,
            ssoStatesDeleted: ssoStateResult.count,
            wsTicketsDeleted: wsTicketResult.count,
            refreshTokensDeleted: refreshTokenResult.count,
          },
          'Retention cleanup completed',
        );
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
