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
// Uses safeDecryptValue so a key mismatch yields null instead of raw ciphertext in the UI.
export function decryptUserPii<T extends { realName?: string | null; phone?: string | null }>(user: T): T {
  return {
    ...user,
    realName: user.realName ? safeDecryptValue(user.realName) : user.realName,
    phone: user.phone ? safeDecryptValue(user.phone) : user.phone,
  };
}

// Decrypt the author's realName on a message before sending to the client.
// Also decrypts replyTo.author.realName so quoted message previews show the correct name.
export function decryptMessageAuthor<T extends { author: { realName: string | null }; replyTo?: { author: { realName: string | null } } | null }>(msg: T): T {
  const decName = (n: string | null) => (n ? safeDecryptValue(n) : null);
  return {
    ...msg,
    author: { ...msg.author, realName: decName(msg.author.realName) },
    replyTo: msg.replyTo
      ? { ...msg.replyTo, author: { ...msg.replyTo.author, realName: decName(msg.replyTo.author.realName) } }
      : msg.replyTo,
  };
}

// Falls back to returning the value as-is for unencrypted legacy rows.
// On actual decryption failure (wrong key / corrupted data) also returns the raw value.
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

// Like decryptValue but returns null when decryption fails (wrong key / corrupted).
// Use this for PII fields displayed in the UI so a bad key shows nothing instead of
// exposing raw ciphertext.
export function safeDecryptValue(value: string): string | null {
  const parts = value.split(':');
  if (parts.length !== 3) return value; // unencrypted legacy value — return as-is
  try {
    const key = getKey();
    const [ivHex, tagHex, encHex] = parts as [string, string, string];
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}
