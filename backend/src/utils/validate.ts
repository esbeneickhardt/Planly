/**
 * Zod validation helper for Fastify route handlers.
 *
 * Keeps route bodies consistent: parse with a typed schema, send 400 with the first
 * human-readable error message on failure, return the typed value on success.
 */
import type { ZodSchema, ZodError } from 'zod';
import type { FastifyReply } from 'fastify';

function firstMessage(err: ZodError): string {
  return err.issues[0]?.message ?? 'Validation error';
}

/**
 * Parses `data` against `schema`. On failure sends a 400 with the first
 * validation message and returns null. On success returns the parsed value.
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.status(400).send({ error: firstMessage(result.error) });
    return null;
  }
  return result.data;
}
