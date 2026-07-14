/**
 * Singleton Prisma client shared across the entire backend process.
 * Importing this module in multiple files always returns the same instance,
 * which keeps connection-pool usage predictable and avoids exhausting the database.
 */
import { PrismaClient } from '@prisma/client';

// Single shared instance - never instantiate PrismaClient elsewhere
const prisma = new PrismaClient();
export default prisma;
