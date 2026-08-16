/**
 * Product (project) authorization guards - reusable preHandler helpers that
 * check membership and tab-level permissions before allowing route handlers to run.
 *
 * Permission model:
 *   - Owner and co-owners always have full write access to every tab.
 *   - Regular members default to write access unless a TabPermission row says otherwise.
 *   - Explicit 'none' level completely hides a tab from a member.
 *   - Absent row = write (default); 'read' = view-only; 'write' = full access.
 *
 * App Registration tokens bypass the human membership check: if the token is
 * scoped to this product, the app is treated as a standalone member whose tab
 * access is governed by the permissions stored on the AppRegistration itself.
 * An absent entry in app.permissions defaults to 'write'.
 * App tokens never satisfy requireProductCoOwner — that gate is for humans only.
 */
import { FastifyReply } from 'fastify';
import type { AuthPayload } from '../middleware/auth';
import prisma from '../db/client';

/**
 * Verifies that the caller is a member of the team that owns `productId`.
 * For app tokens scoped to this product the membership DB check is skipped —
 * the token scope itself is the proof of authorisation.
 * Sends 404 or 403 and returns false when access is denied.
 */
export async function requireProductMember(
  productId: string,
  user: AuthPayload,
  reply: FastifyReply,
): Promise<boolean> {
  // App token scoped to this product — skip creator membership check
  if (user.appName && user.scopedProductId === productId) {
    const exists = await prisma.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } });
    if (!exists) {
      reply.status(404).send({ error: 'Not found' });
      return false;
    }
    return true;
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      team: {
        select: {
          members: { where: { userId: user.userId }, select: { userId: true } },
        },
      },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.team.members.length === 0) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

/**
 * Verifies that the caller has write-level access to at least one of the given tabs.
 * For app tokens the check is against the app's own permissions, not the creator's.
 * An absent entry in app permissions defaults to 'write'.
 * Sends 403 and returns false on deny.
 */
export async function requireTabWrite(
  productId: string,
  user: AuthPayload,
  tabs: string[],
  reply: FastifyReply,
): Promise<boolean> {
  // App token — use the app's own per-tab permissions; absent entry defaults to write
  if (user.appName && user.scopedProductId === productId) {
    const perms = user.appPermissions ?? {};
    const hasWrite = tabs.some((tab) => (perms[tab] ?? 'write') === 'write');
    if (!hasWrite) {
      reply.status(403).send({ error: 'Write access required' });
      return false;
    }
    return true;
  }

  const { userId } = user;
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      status: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }

  // Project-lifecycle lockdown, checked before anything else: 'archived' blocks writes for
  // everyone, including the owner (checked here, ahead of the owner bypass below). A
  // project-scoped API/app token can never reach this function with a still-valid token once
  // the project is locked - revokeProjectTokens (see products.ts / admin/stats.ts) deletes every
  // token scoped to this project the moment it enters 'completed' or 'archived', so the
  // app-token branch above doesn't need its own copy of this check.
  if (product.status === 'archived') {
    reply.status(403).send({ error: 'This project is archived and read-only.' });
    return false;
  }
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (!member) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  if (member.role === 'co_owner') return true;

  // 'completed' blocks writes for everyone except the owner/co-owner (both already handled
  // above), regardless of what their stored TabPermission rows say.
  if (product.status === 'completed') {
    reply.status(403).send({ error: 'This project is completed and read-only for members.' });
    return false;
  }

  const rows = await prisma.tabPermission.findMany({
    where: { productId, userId, tab: { in: tabs } },
    select: { tab: true, level: true },
  });

  const hasWrite = tabs.some((tab) => {
    const row = rows.find((r) => r.tab === tab);
    return !row || row.level === 'write';
  });

  if (!hasWrite) {
    reply.status(403).send({ error: 'Write access required' });
    return false;
  }
  return true;
}

/**
 * Same project-lifecycle lockdown rule as requireTabWrite above ('archived' blocks everyone
 * including the owner; 'completed' blocks everyone except the owner/co-owner), for routes that
 * don't have per-tab permissions at all - currently just chat message posting/editing/deleting/
 * reacting, which only checks membership via requireProductMember today even though 'messages' is
 * a valid TabPermission tab. See requireTabWrite's comment for why this doesn't need its own
 * app-token special case.
 */
export async function requireProductWritable(
  productId: string,
  user: AuthPayload,
  reply: FastifyReply,
): Promise<boolean> {
  const { userId } = user;
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      status: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.status === 'archived') {
    reply.status(403).send({ error: 'This project is archived and read-only.' });
    return false;
  }
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (!member) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  if (member.role === 'co_owner') return true;

  if (product.status === 'completed') {
    reply.status(403).send({ error: 'This project is completed and read-only for members.' });
    return false;
  }
  return true;
}

/**
 * Verifies that the caller has at least read-level access (not 'none') on at
 * least one of the given tabs.
 * For app tokens the check is against the app's own permissions; absent entry defaults to 'write'.
 * Sends 403 and returns false on deny.
 */
export async function requireTabRead(
  productId: string,
  user: AuthPayload,
  tabs: string[],
  reply: FastifyReply,
): Promise<boolean> {
  // App token — use the app's own per-tab permissions; absent entry defaults to write
  if (user.appName && user.scopedProductId === productId) {
    const perms = user.appPermissions ?? {};
    const canRead = tabs.some((tab) => (perms[tab] ?? 'write') !== 'none');
    if (!canRead) {
      reply.status(403).send({ error: 'Access denied' });
      return false;
    }
    return true;
  }

  const { userId } = user;
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (!member) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  if (member.role === 'co_owner') return true;

  const rows = await prisma.tabPermission.findMany({
    where: { productId, userId, tab: { in: tabs } },
    select: { tab: true, level: true },
  });

  const canRead = tabs.some((tab) => {
    const row = rows.find((r) => r.tab === tab);
    return !row || row.level !== 'none';
  });

  if (!canRead) {
    reply.status(403).send({ error: 'Access denied' });
    return false;
  }
  return true;
}

/**
 * Verifies that the caller is the owner or a co-owner of `productId`.
 * App tokens never satisfy this guard — project management operations require a human.
 * Sends 404/403 and returns false on deny.
 */
export async function requireProductCoOwner(productId: string, userId: string, reply: FastifyReply): Promise<boolean> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });

  if (!product) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  if (product.ownerId === userId) return true;

  const member = product.team.members[0];
  if (member?.role === 'co_owner') return true;

  reply.status(403).send({ error: 'Forbidden' });
  return false;
}

/**
 * Boolean-returning variant of requireProductCoOwner that doesn't send a reply - for callers
 * that need to fold the co-owner check into their own conditional rather than short-circuit
 * the handler (e.g. bypassing the analyticsEnabled gate for owners/co-owners in activity.ts
 * and analytics.ts). Returns false (rather than 404ing) if the product doesn't exist.
 */
export async function isProductCoOwner(productId: string, userId: string): Promise<boolean> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      ownerId: true,
      team: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });
  if (!product) return false;
  if (product.ownerId === userId) return true;
  return product.team.members[0]?.role === 'co_owner';
}

/**
 * Resolves whether `userId` can legitimately claim the "Project Owner" / "Project Co-Owner" chat
 * role badges (the `postedAsRole` field on Message/Announcement/AnnouncementComment), to prevent
 * spoofing - mirrors the existing "Server Owner"/"Server Admin" checks (isFoundingAdmin/isAdmin)
 * that already guard those two badges at every postedAsRole call site.
 *
 * These two badges are only meaningful relative to a specific product or, failing that, a specific
 * team (co-ownership is a TeamRole, granted per-team rather than per-product - see requireTabWrite's
 * doc comment above). A call site with neither a productId nor a teamId in scope (e.g. the global
 * admin chat, or a server-wide announcement) has nothing to verify the claim against, so both come
 * back false and the caller should null out the claim exactly as it would for a failed admin check.
 */
export async function resolveProjectRoleClaims(
  userId: string,
  scope: { productId?: string; teamId?: string },
): Promise<{ isProjectOwner: boolean; isProjectCoOwner: boolean }> {
  let teamId = scope.teamId;
  let isProjectOwner = false;

  if (scope.productId) {
    const product = await prisma.product.findFirst({
      where: { id: scope.productId, deletedAt: null },
      select: { ownerId: true, teamId: true },
    });
    isProjectOwner = product?.ownerId === userId;
    teamId = product?.teamId;
  } else if (scope.teamId) {
    // No single product in scope (e.g. a team-wide announcement) - "owner" means owning at
    // least one active product on that team.
    const owned = await prisma.product.count({ where: { teamId: scope.teamId, ownerId: userId, deletedAt: null } });
    isProjectOwner = owned > 0;
  }

  if (!teamId) return { isProjectOwner, isProjectCoOwner: false };
  const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
  return { isProjectOwner, isProjectCoOwner: member?.role === 'co_owner' };
}

/**
 * For routes that don't have a productId in the URL path - so the global Bearer-token URL-regex
 * scope check in middleware/auth.ts (which only matches `/api/products/:id` shapes) never runs -
 * but still act on a specific product's resource (e.g. file uploads, or a WebSocket room join).
 * Verifies a scoped PAT/App token isn't being used outside the project it's locked to. No-op
 * (returns true) when the token isn't scoped. Sends 403 and returns false on mismatch.
 */
export function requireScopeMatch(productId: string, user: AuthPayload, reply: FastifyReply): boolean {
  if (user.scopedProductId && user.scopedProductId !== productId) {
    reply.status(403).send({ error: 'Token is not authorized for this project' });
    return false;
  }
  return true;
}

/**
 * Deletes every ApiToken scoped to this exact project - both directly-scoped PATs and ones
 * issued under a project-scoped App Registration (both already store productId on the ApiToken
 * row itself, see api-tokens.ts/app-registrations.ts). Call this whenever a project transitions
 * into 'completed' or 'archived', so a token that would otherwise bypass the read-only lockdown
 * can't be used at all - see requireTabWrite/requireProductWritable's comments for why those two
 * don't need their own app-token special case. Returns the number of tokens revoked, for the
 * audit log.
 */
export async function revokeProjectTokens(productId: string): Promise<number> {
  const { count } = await prisma.apiToken.deleteMany({ where: { productId } });
  return count;
}
