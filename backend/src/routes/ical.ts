/**
 * iCal export routes - generate RFC 5545 calendar feeds for task due dates.
 *
 * Each user gets a stable, token-authenticated iCal subscription URL that
 * calendar apps (Google Calendar, Apple Calendar, Outlook) can subscribe to.
 * The feed includes all tasks with due dates across projects the user belongs to.
 * The token is a SHA-256 hash stored in the database - rotation invalidates old URLs.
 */
import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Formats a Date as an iCal UTC datetime string (e.g. 20260101T120000Z)
function icalDate(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

// Formats a Date as an iCal all-day date value (e.g. 20260101) with no time component
function icalDateOnly(d: Date): string {
  return (d.toISOString().split('T')[0] ?? '').replace(/-/g, '');
}

// Returns a new Date advanced by exactly one UTC day (used for exclusive DTEND values)
function addDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + 1);
  return r;
}

// Escapes special characters in iCal text fields per RFC 5545
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export async function icalRoutes(app: FastifyInstance) {

  // ── Calendar feed ─────────────────────────────────────────────────────────
  app.get('/api/products/:productId/calendar.ics', async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { token } = req.query as { token?: string };

    if (!token) return reply.status(401).send({ error: 'token required' });

    // Authenticate via hashed PAT
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const apiToken = await prisma.apiToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, productId: true },
    });

    if (!apiToken || (apiToken.expiresAt && apiToken.expiresAt < new Date())) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Enforce token-product scope restriction
    if (apiToken.productId && apiToken.productId !== productId) {
      return reply.status(403).send({ error: 'Token not authorized for this product' });
    }

    // Verify token owner is a member of the requested product
    const product = await prisma.product.findFirst({
      where: { id: productId, team: { members: { some: { userId: apiToken.userId } } } },
      select: { id: true, name: true, deadline: true, createdAt: true },
    });

    if (!product) return reply.status(404).send({ error: 'Not found' });

    prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    // Fetch tasks with deadlines and sprint windows in parallel
    const [tasks, sprints] = await Promise.all([
      prisma.task.findMany({
        where: { productId, deadline: { not: null }, deletedAt: null },
        select: { id: true, name: true, deadline: true, status: true, description: true },
        orderBy: { deadline: 'asc' },
      }),
      prisma.sprint.findMany({
        where: { productId },
        select: { id: true, name: true, startDate: true, endDate: true },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    // Build the iCalendar header
    const stamp = icalDate(new Date());
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Planly//Planly Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(product.name)}`,
      'X-WR-TIMEZONE:UTC',
    ];

    // Project deadline
    lines.push(
      'BEGIN:VEVENT',
      `UID:product-${product.id}@planly`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icalDateOnly(new Date(product.deadline))}`,
      `DTEND;VALUE=DATE:${icalDateOnly(addDay(new Date(product.deadline)))}`,
      `SUMMARY:🏁 ${esc(product.name)} - Project deadline`,
      'CATEGORIES:PROJECT',
      'END:VEVENT',
    );

    // Task deadlines
    for (const task of tasks) {
      if (!task.deadline) continue;
      lines.push(
        'BEGIN:VEVENT',
        `UID:task-${task.id}@planly`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icalDateOnly(new Date(task.deadline))}`,
        `DTEND;VALUE=DATE:${icalDateOnly(addDay(new Date(task.deadline)))}`,
        `SUMMARY:${esc(task.name)}`,
        'CATEGORIES:TASK',
        task.status === 'done' ? 'STATUS:COMPLETED' : 'STATUS:NEEDS-ACTION',
        ...(task.description ? [`DESCRIPTION:${esc(task.description.slice(0, 500))}`] : []),
        'END:VEVENT',
      );
    }

    // Sprint windows
    for (const sprint of sprints) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:sprint-${sprint.id}@planly`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icalDateOnly(new Date(sprint.startDate))}`,
        `DTEND;VALUE=DATE:${icalDateOnly(addDay(new Date(sprint.endDate)))}`,
        `SUMMARY:📌 Sprint: ${esc(sprint.name)}`,
        'CATEGORIES:SPRINT',
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');

    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="planly-${productId}.ics"`)
      .header('Cache-Control', 'no-cache, no-store')
      .send(lines.join('\r\n'));
  });

  // ── Generate calendar token ────────────────────────────────────────────────
  app.post('/api/products/:productId/calendar/token', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };

    const product = await prisma.product.findFirst({
      where: { id: productId, team: { members: { some: { userId: req.user.userId } } } },
      select: { id: true },
    });
    if (!product) return reply.status(404).send({ error: 'Not found' });

    // Revoke any existing calendar tokens for this user + product
    const existing = await prisma.apiToken.findMany({
      where: { userId: req.user.userId, name: 'Calendar Feed', productId },
      select: { id: true },
    });
    if (existing.length > 0) {
      await prisma.apiToken.deleteMany({ where: { id: { in: existing.map((t) => t.id) } } });
    }

    // Create a new hashed token and return the raw value (shown once)
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await prisma.apiToken.create({
      data: {
        userId: req.user.userId,
        productId,
        name: 'Calendar Feed',
        tokenHash,
      },
    });

    reply.status(201).send({ token: rawToken });
  });

  // ── Revoke calendar token ──────────────────────────────────────────────────
  app.delete('/api/products/:productId/calendar/token', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };

    await prisma.apiToken.deleteMany({
      where: { userId: req.user.userId, name: 'Calendar Feed', productId },
    });

    reply.send({ ok: true });
  });

  // ── Check if calendar token exists ────────────────────────────────────────
  app.get('/api/products/:productId/calendar/token', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };

    const token = await prisma.apiToken.findFirst({
      where: { userId: req.user.userId, name: 'Calendar Feed', productId },
      select: { id: true, createdAt: true },
    });

    reply.send({ hasToken: !!token, createdAt: token?.createdAt ?? null });
  });
}
