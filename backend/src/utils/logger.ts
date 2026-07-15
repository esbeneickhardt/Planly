/**
 * Shared pino logger for utility modules that run outside of a Fastify request context.
 *
 * Route handlers should use `req.log` (the per-request child logger). This module is
 * for utilities like audit, activity, notifications, and webhook-dispatch that are
 * called fire-and-forget and have no access to a request object.
 */
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
