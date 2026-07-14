/**
 * One-off migration: encrypt existing plaintext realName and phone values in the User table.
 *
 * Usage:
 *   ENCRYPTION_KEY=<key> DATABASE_URL=<url> npx tsx scripts/encrypt-pii-fields.ts
 *
 * Run ONCE after deploying the code that uses encryptValue/decryptValue on these fields.
 * The script is idempotent - it skips rows that already look like encrypted values
 * (i.e. contain ':' separators from the "<iv>:<tag>:<ciphertext>" format).
 */
import { PrismaClient } from '@prisma/client';
import { encryptValue } from '../backend/src/utils/crypto';

const prisma = new PrismaClient();

function isEncrypted(value: string): boolean {
  return value.split(':').length === 3;
}

async function main() {
  let updated = 0;
  let skipped = 0;

  const users = await prisma.user.findMany({
    select: { id: true, realName: true, phone: true },
  });

  for (const user of users) {
    const updates: { realName?: string; phone?: string } = {};

    if (user.realName && !isEncrypted(user.realName)) {
      updates.realName = encryptValue(user.realName);
    }
    if (user.phone && !isEncrypted(user.phone)) {
      updates.phone = encryptValue(user.phone);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: updates });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped (already encrypted or null): ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
