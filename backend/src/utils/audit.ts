/**
 * Audit logging utility - fire-and-forget helper for writing admin audit log entries.
 *
 * All security-relevant actions (auth, tokens, webhooks, permissions, team changes)
 * across the app call logAdminEvent() so they appear in Admin → Audit Log and
 * in CSV/JSONL exports. Failures are warned but never thrown - a logging failure
 * must never break the request that triggered it.
 */
import prisma from '../db/client';
import { Prisma } from '@prisma/client';
import { logger } from './logger';

/**
 * Writes an audit log entry asynchronously. Safe to call without awaiting.
 *
 * @param action - Event type string (e.g. 'LOGIN_FAILED', 'WEBHOOK_CREATED')
 * @param opts.actorName - Username or system identifier that performed the action
 * @param opts.targetName - Username, team name, or resource name that was affected
 * @param opts.metadata - Arbitrary structured context (IP, old/new values, IDs, etc.)
 */
export function logAdminEvent(
  action: string,
  opts: { actorName?: string; targetName?: string; metadata?: Prisma.InputJsonValue } = {},
) {
  return prisma.adminLog
    .create({ data: { action, actorName: opts.actorName, targetName: opts.targetName, metadata: opts.metadata } })
    .catch((err: Error) => {
      logger.warn({ err: err.message, action }, 'audit write failed');
    });
}
