import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY env var is required for encryption operations');
  return createHash('sha256').update('planly-enc-key:' + secret).digest();
}

// Returns "<ivHex>:<authTagHex>:<ciphertextHex>"
export function encryptValue(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Encrypt an optional field — returns undefined if input is undefined/null.
export function encryptOptional(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  return encryptValue(value);
}

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
