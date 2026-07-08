import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('API token routes smoke', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let userId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const user = await createTestUser({ username: `token_user_${suffix}`, email: `token_user_${suffix}@example.com` });
    userId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: `token_user_${suffix}@example.com`, password: 'test-password-123' },
    });
    cookie = (loginRes.headers['set-cookie'] as string).split(';')[0] ?? '';
  });

  afterAll(async () => {
    await prisma.apiToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /api/auth/tokens returns empty list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/tokens',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('POST /api/auth/tokens creates a token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: { cookie },
      payload: { name: 'CI token' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('CI token');
    expect(typeof body.token).toBe('string');
  });

  it('DELETE /api/auth/tokens/:tokenId removes token', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: { cookie },
      payload: { name: 'To Delete' },
    });
    const { id } = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/auth/tokens/${id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
  });
});
