/**
 * Encryption key rotation utility.
 *
 * Re-encrypts all encrypted values in the database (SMTP passwords, webhook secrets)
 * from the OLD key to the NEW key in a single transaction.
 *
 * Usage:
 *   OLD_ENCRYPTION_KEY=<old-key> NEW_ENCRYPTION_KEY=<new-key> \
 *     DATABASE_URL=<url> npx tsx scripts/rotate-encryption-key.ts
 *
 * After verifying the rotation was successful, update ENCRYPTION_KEY in your .env
 * to NEW_ENCRYPTION_KEY and restart the backend.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update('planly-enc-key:' + secret).digest();
}

function decryptWith(value: string, key: Buffer): string | null {
  const parts = value.split(':');
  if (parts.length !== 3) return null; // plaintext (legacy unencrypted)
  try {
    const [ivHex, tagHex, encHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

function encryptWith(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  const oldKeyRaw = process.env.OLD_ENCRYPTION_KEY;
  const newKeyRaw = process.env.NEW_ENCRYPTION_KEY;

  if (!oldKeyRaw || !newKeyRaw) {
    console.error('ERROR: OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must both be set');
    process.exit(1);
  }
  if (oldKeyRaw === newKeyRaw) {
    console.error('ERROR: OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY are identical - nothing to rotate');
    process.exit(1);
  }

  const oldKey = deriveKey(oldKeyRaw);
  const newKey = deriveKey(newKeyRaw);

  console.log('Starting encryption key rotation...');

  // Collect all re-encryption operations
  const updates: Promise<unknown>[] = [];
  let rotated = 0;
  let skipped = 0;
  let errors = 0;

  // Rotate webhook secrets
  const webhooks = await prisma.webhook.findMany({ select: { id: true, secret: true } });
  for (const wh of webhooks) {
    const plaintext = decryptWith(wh.secret, oldKey);
    if (plaintext === null) {
      console.warn(`  [webhook ${wh.id}] Could not decrypt with old key - skipping`);
      errors++;
      continue;
    }
    updates.push(
      prisma.webhook.update({ where: { id: wh.id }, data: { secret: encryptWith(plaintext, newKey) } })
    );
    rotated++;
  }
  console.log(`  Webhooks: ${rotated} to rotate, ${errors} errors, ${skipped} skipped`);

  // Rotate server config SMTP password (if stored encrypted)
  const smtpRotated = { count: 0, errors: 0 };
  const smtpConfigs = await prisma.serverConfig.findMany({ select: { id: true, smtpPass: true } });
  for (const cfg of smtpConfigs) {
    if (!cfg.smtpPass) { skipped++; continue; }
    const plaintext = decryptWith(cfg.smtpPass, oldKey);
    if (plaintext === null) {
      console.warn(`  [serverConfig ${cfg.id}] Could not decrypt smtpPass with old key - skipping`);
      smtpRotated.errors++;
      continue;
    }
    updates.push(
      prisma.serverConfig.update({ where: { id: cfg.id }, data: { smtpPass: encryptWith(plaintext, newKey) } })
    );
    smtpRotated.count++;
  }
  console.log(`  SMTP passwords: ${smtpRotated.count} to rotate, ${smtpRotated.errors} errors`);

  if (updates.length === 0) {
    console.log('Nothing to rotate. Exiting.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Applying ${updates.length} updates in a transaction...`);
  await prisma.$transaction(updates as Parameters<typeof prisma.$transaction>[0]);
  console.log('Done. Update ENCRYPTION_KEY in your .env to NEW_ENCRYPTION_KEY and restart the backend.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
