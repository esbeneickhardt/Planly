/**
 * Prisma error helpers - translate well-known Prisma error codes into HTTP responses.
 * Use these in route catch blocks to avoid duplicating P2025/P2002 handling everywhere.
 * Any error that does not match the expected code is re-thrown for the global error handler.
 */
import { Prisma } from '@prisma/client';
import type { FastifyReply } from 'fastify';

/**
 * Call inside a catch block. Sends 404 if the Prisma error is P2025
 * (record not found / update target missing), otherwise re-throws so
 * Fastify's global error handler can log and return 500.
 */
export function handleNotFound(e: unknown, reply: FastifyReply, message = 'Not found'): void {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
    reply.status(404).send({ error: message });
    return;
  }
  throw e;
}

/**
 * Call inside a catch block for unique-constraint violations.
 * Sends 409 on P2002, re-throws everything else.
 */
export function handleConflict(e: unknown, reply: FastifyReply, message = 'Already exists'): void {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    reply.status(409).send({ error: message });
    return;
  }
  throw e;
}
