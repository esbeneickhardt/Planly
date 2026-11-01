// Prisma CLI configuration (migrate, generate, db push). Prisma 7 no longer reads the
// connection URL from schema.prisma or loads .env itself; DATABASE_URL comes from the
// environment (compose, CI, or run-tests.sh).
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
