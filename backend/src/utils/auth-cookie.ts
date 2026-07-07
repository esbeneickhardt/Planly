import type { FastifyReply } from 'fastify';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function issueAuthCookie(reply: FastifyReply, token: string): void {
  reply.setCookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.COOKIE_SECURE !== 'false',
  });
}
