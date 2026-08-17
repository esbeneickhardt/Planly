/**
 * Refresh token lifecycle - issue, rotate, and revoke long-lived refresh tokens.
 *
 * Every login mints a new token family (randomUUID). All rotated successors share
 * that familyId. If a consumed token is ever presented again (reuse attack), the
 * entire family is deleted, forcing a fresh login.
 *
 * Token format: planly_rt_<48 hex chars>  (identified in logs, easy to grep)
 * Storage:      SHA-256 hash only - the raw value is never retrievable from the DB.
 * Lifetime:     30 days, renewed on each rotation.
 */
import { createHash, randomBytes, randomUUID } from 'crypto';
import prisma from '../db/client';

const RT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function rawToken(): string {
  return `planly_rt_${randomBytes(24).toString('hex')}`;
}

// Creates a new refresh token family and returns the raw value for the cookie.
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = rawToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId: randomUUID(),
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + RT_TTL_MS),
    },
  });
  return raw;
}

// Consumes a refresh token and issues its successor.
// Returns { raw, userId } on success, null on any failure.
// Null cases:
//   - Token not found (bad cookie / already pruned)
//   - rotatedAt is set → reuse detected → entire family revoked
//   - Token is past its expiresAt
export async function rotateRefreshToken(rawValue: string): Promise<{ raw: string; userId: string } | null> {
  const tokenHash = hashToken(rawValue);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return null;

  // Reuse detection - token was already rotated; revoke every token in the family
  if (existing.rotatedAt !== null) {
    await prisma.refreshToken.deleteMany({ where: { familyId: existing.familyId } });
    return null;
  }

  if (existing.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: existing.id } }).catch(() => {});
    return null;
  }

  const newRaw = rawToken();
  await prisma.$transaction([
    // Mark old token as consumed
    prisma.refreshToken.update({ where: { id: existing.id }, data: { rotatedAt: new Date() } }),
    // Issue successor in the same family
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        familyId: existing.familyId,
        tokenHash: hashToken(newRaw),
        expiresAt: new Date(Date.now() + RT_TTL_MS),
      },
    }),
  ]);

  return { raw: newRaw, userId: existing.userId };
}

// Deletes all tokens in the same family as the given raw token (logout / forced revocation).
export async function revokeRefreshFamily(rawValue: string): Promise<void> {
  const tokenHash = hashToken(rawValue);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash }, select: { familyId: true } });
  if (!existing) return;
  await prisma.refreshToken.deleteMany({ where: { familyId: existing.familyId } });
}
