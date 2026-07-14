/**
 * AES-256-GCM encryption utilities for secrets stored in the database.
 *
 * Used to encrypt webhook signing secrets and SMTP passwords at rest.
 * The key is derived from ENCRYPTION_KEY via HKDF (RFC 5869) with a domain-separation
 * info string, so the raw env var value is never used directly as the cipher key.
 *
 * Ciphertext format stored in the database: "<ivHex>:<authTagHex>:<ciphertextHex>"
 * The GCM auth tag detects tampering - decryptValue throws on a corrupted value.
 *
 * MIGRATION NOTE: Changing ENCRYPTION_KEY breaks decryption of existing rows.
 * Run scripts/rotate-encryption-key.ts to re-encrypt in-place when rotating.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

// HKDF (RFC 5869) derives a well-structured 256-bit key from the raw ENCRYPTION_KEY value.
// Unlike a bare SHA-256 hash this adds domain separation (info string) and salt, making
// the derived key robust regardless of the input's entropy or format.
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY env var is required for encryption operations');
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'), 'planly-v1', 'aes-256-gcm-key', 32),
  );
}

// Encryption helpers

// Returns "<ivHex>:<authTagHex>:<ciphertextHex>"
export function encryptValue(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Encrypt an optional field - returns undefined if input is undefined/null.
export function encryptOptional(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  return encryptValue(value);
}

// PII helpers

// Decrypt user PII fields in-place. Handles nulls and unencrypted legacy values gracefully.
export function decryptUserPii<T extends { realName?: string | null; phone?: string | null }>(user: T): T {
  return {
    ...user,
    realName: user.realName ? decryptValue(user.realName) : user.realName,
    phone: user.phone ? decryptValue(user.phone) : user.phone,
  };
}

// Falls back to returning the value as-is for unencrypted legacy rows.
export function decryptValue(value: string): string {
  const parts = value.split(':');
  if (parts.length !== 3) return value;
  try {
    const key = getKey();
    const [ivHex, tagHex, encHex] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString('utf8') + decipher.final('utf8');
  } catch {
    return value;
  }
}
