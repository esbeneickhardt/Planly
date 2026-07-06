import { randomBytes } from 'crypto';

interface Ticket {
  userId: string;
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();
const TICKET_TTL_MS = 30_000;

// Clean up expired tickets every minute
setInterval(() => {
  const now = Date.now();
  for (const [token, ticket] of tickets) {
    if (ticket.expiresAt < now) tickets.delete(token);
  }
}, 60_000);

export function issueTicket(userId: string): string {
  const token = randomBytes(32).toString('hex');
  tickets.set(token, { userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return token;
}

export function consumeTicket(token: string): string | null {
  const ticket = tickets.get(token);
  if (!ticket) return null;
  tickets.delete(token); // single-use
  if (ticket.expiresAt < Date.now()) return null;
  return ticket.userId;
}
