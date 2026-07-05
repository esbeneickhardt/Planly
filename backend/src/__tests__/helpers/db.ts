import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: [],
});

export function randomSuffix() {
  return randomBytes(6).toString('hex');
}

export async function createTestUser(overrides: {
  username?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
} = {}) {
  const suffix = randomSuffix();
  const password = overrides.password ?? 'test-password-123';
  return prisma.user.create({
    data: {
      username: overrides.username ?? `testuser_${suffix}`,
      email: overrides.email ?? `test_${suffix}@example.com`,
      passwordHash: await bcrypt.hash(password, 1), // cost=1 for speed in tests
      emailVerified: true,
      isAdmin: overrides.isAdmin ?? false,
    },
  });
}

export async function createTestTeam(ownerId: string, memberIds: string[] = []) {
  const suffix = randomSuffix();
  const allIds = Array.from(new Set([ownerId, ...memberIds]));
  return prisma.team.create({
    data: {
      name: `test-team-${suffix}`,
      members: { create: allIds.map((userId) => ({ userId })) },
    },
  });
}

export async function createTestProduct(ownerId: string, teamId: string) {
  const suffix = randomSuffix();
  return prisma.product.create({
    data: {
      name: `test-product-${suffix}`,
      emoji: '🧪',
      ownerId,
      teamId,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

export async function cleanupTestUsers(emails: string[]) {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

export async function cleanupTestTeams(names: string[]) {
  await prisma.team.deleteMany({ where: { name: { in: names } } });
}
