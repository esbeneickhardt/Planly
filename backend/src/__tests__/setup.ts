// Must be set before any module that imports config/env.ts
process.env.JWT_SECRET = 'vitest-test-secret-do-not-use-in-production-32chars';
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://planly:test@localhost:5432/planly_test';
