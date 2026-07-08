/**
 * Shared pino logger for utility modules that run outside of a Fastify request context.
 *
 * Route handlers should use `req.log` (the per-request child logger). This module is
 * for utilities like audit, activity, notifications, and webhook-dispatch that are
 * called fire-and-forget and have no access to a request object.
 */
import pino from 'pino';

const transport =
  process.env.LOG_FORMAT === 'pretty'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(transport ? { transport } : {}),
});
