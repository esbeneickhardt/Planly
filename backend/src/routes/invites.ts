/**
 * Invite routes - create, revoke, accept, and decline team invite links.
 *
 * Three invite types:
 *   Open invite     - shareable URL valid for anyone; multi-use with an optional maxUses cap.
 *   Email invite    - targeted to one address; single-use; sends an email if SMTP is configured.
 *   User invite     - targeted to a specific registered user (created via Settings → Team);
 *                     stored with toUserId; user accepts or declines via notification bell or
 *                     MembershipsModal rather than visiting a link.
 *
 * useCount tracks redemptions. The invite is exhausted (usedAt set) only when
 * maxUses is set and useCount reaches it - open invites with no maxUses are permanent.
 * All invites expire after 7 days. Acceptance events are recorded in the audit log.
 */
import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { config } from '../config/env';
import { sendEmail, teamInviteEmail } from '../utils/email';
import { validate } from '../utils/validate';
import { logAdminEvent } from '../utils/audit';
import { getTeamAdmin, requireTeamScopeMatch } from '../utils/team-guard';

// Validates invite creation - email makes it targeted; maxUses caps redemptions for open links
const createInviteSchema = z.object({
  email: z.string().email().optional(),
  maxUses: z.number().int().min(1).max(1000).optional(), // open invite use cap; null = unlimited
});

export async function inviteRoutes(app: FastifyInstance) {
  // List invites for a team (admins only) - returns both link invites and pending user-targeted invites
  app.get('/api/teams/:teamId/invites', { preHandler: requireAuth }, async (req, reply) => {
    const { teamId } = req.params as { teamId: string };
    if (!(await requireTeamScopeMatch(teamId, req.user, reply))) return;
    const ctx = await getTeamAdmin(teamId, req.user.userId);
    if (!ctx) return reply.status(404).send({ error: 'Not found' });
    if (!ctx.isAdmin) return reply.status(403).send({ error: 'Forbidden' });

    const invites = await prisma.teamInvite.findMany({
      where: { teamId, usedAt: null, expiresAt: { gt: new Date() } },
      include: {
        toUser: { select: { id: true, username: true, avatarEmoji: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(
      invites.map((i) => ({
        id: i.id,
        email: i.email,
        toUser: i.toUser,
        token: i.token,
        inviteUrl: `${config.appUrl}/invite/${i.token}`,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    );
  });

  // Create invite link (admins only)
  app.post('/api/teams/:teamId/invites', { preHandler: requireAuth }, async (req, reply) => {
    const { teamId } = req.params as { teamId: string };
    const body = validate(createInviteSchema, req.body, reply);
    if (!body) return;
    const { email, maxUses } = body;

    if (!(await requireTeamScopeMatch(teamId, req.user, reply))) return;
    const ctx = await getTeamAdmin(teamId, req.user.userId);
    if (!ctx) return reply.status(404).send({ error: 'Not found' });
    if (!ctx.isAdmin) return reply.status(403).send({ error: 'Forbidden' });

    // Generate a 24-byte URL-safe token with a 7-day expiry
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Email-bound invites default to single-use; open invites are unlimited unless caller sets maxUses
    const resolvedMaxUses = email ? 1 : (maxUses ?? null);

    const invite = await prisma.teamInvite.create({
      data: {
        teamId,
        email: email?.toLowerCase().trim() ?? null,
        token,
        expiresAt,
        maxUses: resolvedMaxUses,
      },
    });

    const inviteUrl = `${config.appUrl}/invite/${token}`;

    // Send email if address provided
    if (email) {
      await sendEmail({
        to: email,
        subject: `You're invited to join ${ctx.team.name} on Planly`,
        html: teamInviteEmail(inviteUrl, ctx.team.name, req.user.username),
      });
    }

    reply.status(201).send({
      id: invite.id,
      email: invite.email,
      toUser: null,
      token: invite.token,
      inviteUrl,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      createdAt: invite.createdAt,
    });
  });

  // Revoke invite (admins only)
  app.delete('/api/teams/:teamId/invites/:inviteId', { preHandler: requireAuth }, async (req, reply) => {
    const { teamId, inviteId } = req.params as {
      teamId: string;
      inviteId: string;
    };
    if (!(await requireTeamScopeMatch(teamId, req.user, reply))) return;
    const ctx = await getTeamAdmin(teamId, req.user.userId);
    if (!ctx) return reply.status(404).send({ error: 'Not found' });
    if (!ctx.isAdmin) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.teamInvite.deleteMany({ where: { id: inviteId, teamId } });
    reply.send({ ok: true });
  });

  // List pending user-targeted invites addressed to the current user
  app.get('/api/invites/pending', { preHandler: requireAuth }, async (req, reply) => {
    const pending = await prisma.teamInvite.findMany({
      where: {
        toUserId: req.user.userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        team: {
          include: {
            products: {
              select: { id: true, name: true, emoji: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(
      pending.map((i) => ({
        id: i.id,
        token: i.token,
        teamId: i.teamId,
        projectName: i.team.products[0]?.name ?? i.team.name,
        projectEmoji: i.team.products[0]?.emoji ?? null,
        productId: i.team.products[0]?.id ?? null,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    );
  });

  // Get invite info (public - no auth required, used on the accept page)
  app.get('/api/invites/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const invite = await prisma.teamInvite.findUnique({
      where: { token },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return reply.status(404).send({ error: 'Invite not found or expired' });
    }
    reply.send({
      teamId: invite.teamId,
      teamName: invite.team.name,
      email: invite.email,
      expiresAt: invite.expiresAt,
    });
  });

  // Accept invite (requires auth)
  app.post('/api/invites/:token/accept', { preHandler: requireAuth }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const invite = await prisma.teamInvite.findUnique({
      where: { token },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invite not found or expired' });
    }

    // User-targeted invites: validate by userId
    if (invite.toUserId) {
      if (invite.toUserId !== req.user.userId) {
        return reply.status(403).send({ error: 'This invite was sent to a different user' });
      }
    } else if (invite.email) {
      // Email-targeted invites: validate by email address
      const acceptingUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { email: true },
      });
      if (!acceptingUser || invite.email.toLowerCase() !== acceptingUser.email.toLowerCase()) {
        return reply.status(403).send({
          error: 'This invite was sent to a different email address',
        });
      }
    }

    // Reserve a use of this invite before granting membership, so a rejected accept (cap already
    // hit) never ends up adding the user to the team anyway.
    if (invite.maxUses !== null) {
      // Atomic conditional increment - only succeeds if useCount is still below the cap at the
      // moment of the write. A plain "read useCount, check it in JS, then write useCount + 1"
      // (the previous approach) races: two concurrent accepts landing when exactly one slot
      // remains could both read the same stale useCount from the findUnique above, both decide
      // the cap isn't hit yet, and both succeed - exceeding maxUses. useCount: { lt: maxUses }
      // turns the check-and-increment into a single atomic DB operation instead.
      const { count } = await prisma.teamInvite.updateMany({
        where: { id: invite.id, useCount: { lt: invite.maxUses } },
        data: { useCount: { increment: 1 } },
      });
      if (count === 0) {
        return reply.status(400).send({
          error: 'This invite has reached its maximum number of uses.',
        });
      }
      // This request's increment may have just hit the cap - mark the invite exhausted so the
      // admin invite list and the public invite-info endpoint stop showing it as active. Safe if
      // a concurrently-winning request does this too (idempotent - both just set the same flag).
      await prisma.teamInvite.updateMany({
        where: {
          id: invite.id,
          useCount: { gte: invite.maxUses },
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
    } else {
      // Unlimited invite - no cap to race against, a plain increment is safe.
      await prisma.teamInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      });
    }

    // Add to team - only reached once this request's use of the invite is confirmed reserved above.
    await prisma.teamMember.upsert({
      where: {
        teamId_userId: { teamId: invite.teamId, userId: req.user.userId },
      },
      create: { teamId: invite.teamId, userId: req.user.userId },
      update: {},
    });

    logAdminEvent('INVITE_ACCEPTED', {
      actorName: req.user.username,
      targetName: invite.team.name,
      // Best-effort - under concurrent accepts the true count may have moved past this by the
      // time this log line is written; it's informational only and never used for enforcement.
      metadata: {
        inviteId: invite.id,
        teamId: invite.teamId,
        useCount: invite.useCount + 1,
        maxUses: invite.maxUses,
      },
    });

    reply.send({
      ok: true,
      teamId: invite.teamId,
      teamName: invite.team.name,
    });
  });

  // Decline a user-targeted invite (only the intended recipient can decline)
  app.post('/api/invites/:token/decline', { preHandler: requireAuth }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const invite = await prisma.teamInvite.findUnique({ where: { token } });
    if (!invite) return reply.status(404).send({ error: 'Invite not found' });
    if (invite.toUserId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.teamInvite.delete({ where: { id: invite.id } });
    reply.send({ ok: true });
  });
}
