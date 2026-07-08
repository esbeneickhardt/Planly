/**
 * WebSocket one-time ticket store — issues and consumes short-lived single-use tokens
 * that allow clients to authenticate a WebSocket upgrade without passing the session JWT
 * in a URL query string (which would be logged by servers and proxies).
 *
 * Tickets are stored in the database (not in-memory) so they are validated correctly
 * across every backend replica in a multi-instance deployment.
 *
 * Flow:
 *   1. Browser POSTs to /api/products/:productId/ws-ticket → receives a 30-second ticket
 *   2. Browser opens WebSocket with ?ticket=<token>
 *   3. consumeTicket() deletes the row immediately (single-use) and checks expiry
 */
import { randomBytes } from 'crypto';
import prisma from '../db/client';

const TICKET_TTL_MS = 30_000;

// Tickets are stored in the DB so WebSocket upgrade requests are correctly validated
// across every replica — an in-memory map would silently fail in multi-instance deployments.

export async function issueTicket(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.wsTicket.create({
    data: { token, userId, expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
  });
  return token;
}

export async function consumeTicket(token: string): Promise<string | null> {
  const ticket = await prisma.wsTicket.findUnique({ where: { token } });
  if (!ticket) return null;
  // Delete immediately — single-use regardless of whether it has expired
  await prisma.wsTicket.delete({ where: { token } }).catch(() => {});
  if (ticket.expiresAt < new Date()) return null;
  return ticket.userId;
}
