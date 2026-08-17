/**
 * Integration test for the invite-acceptance race condition fix (routes/invites.ts).
 *
 * A maxUses-capped invite's useCount must never be exceeded even when multiple accepts land
 * concurrently for the last remaining slot. The accept handler used to read useCount, check the
 * cap in application code, then write useCount + 1 back - two concurrent accepts racing for the
 * same last slot could both read the same stale useCount, both decide the cap wasn't hit yet, and
 * both succeed. The fix uses an atomic conditional update (updateMany with
 * useCount: { lt: maxUses }) so the check-and-increment happens as a single DB operation instead.
 *
 * Set TEST_DATABASE_URL to run locally. Always provided in CI via .github/workflows/test.yml.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, createTestTeam, createTestProduct, randomSuffix } from '../helpers/db';
import { loginAs, cookieJar } from '../helpers/auth';

const HAS_DB = !!process.env.TEST_DATABASE_URL;
const RACE_SIZE = 5;
const PASSWORD = 'test-password-123';

describe.skipIf(!HAS_DB)('Invite accept race condition', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  let ownerId: string;
  let teamId: string;
  let ownerCookie: string;
  const raceUserIds: string[] = [];
  const raceUserCookies: string[] = [];

  beforeAll(async () => {
    app = await buildTestApp();

    const owner = await createTestUser({
      email: `inv_owner_${suffix}@t.com`,
      username: `inv_owner_${suffix}`,
      password: PASSWORD,
    });
    ownerId = owner.id;
    const team = await createTestTeam(ownerId);
    teamId = team.id;
    await createTestProduct(ownerId, teamId); // makes the owner a team "admin" per getTeamAdmin
    ownerCookie = await loginAs(app, `inv_owner_${suffix}@t.com`, PASSWORD);

    // Several distinct users racing to accept the same single-use invite.
    for (let i = 0; i < RACE_SIZE; i++) {
      const email = `inv_race_${i}_${suffix}@t.com`;
      const u = await createTestUser({
        email,
        username: `inv_race_${i}_${suffix}`,
        password: PASSWORD,
      });
      raceUserIds.push(u.id);
      raceUserCookies.push(await loginAs(app, email, PASSWORD));
    }
  });

  afterAll(async () => {
    // Team deletion cascades TeamMember and TeamInvite rows; products must go first (no cascade).
    await prisma.product.deleteMany({ where: { teamId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, ...raceUserIds] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('never lets concurrent accepts exceed maxUses, even when they race for the last slot', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/invites`,
      cookies: cookieJar(ownerCookie),
      payload: { maxUses: 1 },
    });
    expect(createRes.statusCode).toBe(201);
    const { token } = JSON.parse(createRes.body) as { token: string };

    // Fire every accept at once - before the fix, the read-then-write race here could let more
    // than one succeed against the same single-use invite.
    const results = await Promise.all(
      raceUserCookies.map((cookie) =>
        app.inject({
          method: 'POST',
          url: `/api/invites/${token}/accept`,
          cookies: cookieJar(cookie),
        }),
      ),
    );

    const succeeded = results.filter((r) => r.statusCode === 200);
    const rejected = results.filter((r) => r.statusCode !== 200);
    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(RACE_SIZE - 1);
    rejected.forEach((r) => expect(r.statusCode).toBe(400));

    // The DB must agree with the HTTP responses: exactly one use recorded, exactly one of the
    // racing users actually added to the team - never more than maxUses.
    const invite = await prisma.teamInvite.findUnique({ where: { token } });
    expect(invite?.useCount).toBe(1);
    expect(invite?.usedAt).not.toBeNull();

    const members = await prisma.teamMember.findMany({
      where: { teamId, userId: { in: raceUserIds } },
    });
    expect(members).toHaveLength(1);
  });

  it('an unlimited (no maxUses) invite still lets every distinct user accept', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/invites`,
      cookies: cookieJar(ownerCookie),
      payload: {},
    });
    expect(createRes.statusCode).toBe(201);
    const { token } = JSON.parse(createRes.body) as { token: string };

    // Reuse the same race-user pool, but first remove them from the team (added by the previous
    // test / this test's own membership upserts) so accepting is meaningful again.
    await prisma.teamMember.deleteMany({
      where: { teamId, userId: { in: raceUserIds } },
    });

    const results = await Promise.all(
      raceUserCookies.map((cookie) =>
        app.inject({
          method: 'POST',
          url: `/api/invites/${token}/accept`,
          cookies: cookieJar(cookie),
        }),
      ),
    );
    results.forEach((r) => expect(r.statusCode).toBe(200));

    const invite = await prisma.teamInvite.findUnique({ where: { token } });
    expect(invite?.useCount).toBe(RACE_SIZE);
    expect(invite?.usedAt).toBeNull();
  });
});
