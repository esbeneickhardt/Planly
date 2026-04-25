import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthPayload;
  }
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  const token = req.cookies?.token;
  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    req.user = payload;
    done();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
