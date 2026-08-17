/**
 * Unit tests for the AES-256-GCM encrypt/decrypt helpers.
 * These helpers protect PII stored in the database (SMTP passwords, OIDC secrets).
 * decryptValue is intentionally graceful: it returns the input unchanged when the
 * value is plaintext (legacy rows) or when the auth tag is tampered (safe degradation).
 */
import { describe, it, expect } from 'vitest';
import { encryptValue, decryptValue } from '../../utils/crypto';

describe('encryptValue / decryptValue', () => {
  // Basic roundtrip: encrypt → decrypt recovers the original value
  it('roundtrips a simple string', () => {
    const plaintext = 'my-smtp-password';
    expect(decryptValue(encryptValue(plaintext))).toBe(plaintext);
  });

  // Edge case: empty string is a valid SMTP password and must survive encryption
  it('roundtrips an empty string', () => {
    expect(decryptValue(encryptValue(''))).toBe('');
  });

  // Real passwords often contain symbols; none should be stripped by encoding
  it('roundtrips a string with special characters', () => {
    const plaintext = 'p@$$w0rd!#&<>"\'\\';
    expect(decryptValue(encryptValue(plaintext))).toBe(plaintext);
  });

  // Each call uses a fresh random IV so two encryptions of the same value differ
  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encryptValue('same');
    const b = encryptValue('same');
    expect(a).not.toBe(b);
  });

  // Legacy rows stored plaintext before encryption was added; they must still work
  it('decryptValue returns the input unchanged when it is not encrypted (legacy plaintext)', () => {
    expect(decryptValue('plaintext-password')).toBe('plaintext-password');
  });

  // Tampered ciphertext must not crash the server - graceful fallback returns the raw string
  it('decryptValue returns the input when auth tag is tampered (falls back gracefully)', () => {
    const encrypted = encryptValue('secret');
    const parts = encrypted.split(':');
    // Tamper with the auth tag
    parts[1] = '0'.repeat(parts[1]?.length ?? 0);
    const tampered = parts.join(':');
    expect(decryptValue(tampered)).toBe(tampered);
  });

  // Serialisation contract: iv:tag:ciphertext - must stay stable across deployments
  it('encrypted value has the expected iv:tag:ciphertext format', () => {
    const encrypted = encryptValue('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes → 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag is 16 bytes → 32 hex chars
    expect(parts[1]).toHaveLength(32);
  });
});
