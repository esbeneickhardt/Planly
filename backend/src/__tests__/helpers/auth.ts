import type { FastifyInstance } from 'fastify';

/** Logs in as the given user and returns the raw JWT value from the set-cookie header. */
export async function loginAs(app: FastifyInstance, identifier: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identifier, password },
  });
  if (res.statusCode !== 200) throw new Error(`Login failed for ${identifier}: ${res.statusCode} ${res.body}`);
  const raw = (res.headers['set-cookie'] as string | undefined) ?? '';
  return raw.split(';')[0]?.replace('token=', '') ?? '';
}

/** Returns headers for a Bearer-token authenticated request. */
export function bearerHeaders(raw: string): Record<string, string> {
  return { authorization: `Bearer ${raw}` };
}

/** Returns cookie jar object for a cookie-authenticated request (Fastify inject style). */
export function cookieJar(token: string): Record<string, string> {
  return { token };
}
