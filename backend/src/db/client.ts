/**
 * Singleton Prisma client shared across the entire backend process.
 * Importing this module in multiple files always returns the same instance,
 * which keeps connection-pool usage predictable and avoids exhausting the database.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Single shared instance - never instantiate PrismaClient elsewhere.
// Prisma 7 talks to Postgres through the pg driver adapter.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
export default prisma;
