/**
 * Invite routes — create, revoke, and accept team invite links.
 *
 * Two invite types:
 *   Open invite — shareable URL valid for anyone; multi-use with an optional maxUses cap.
 *   Email invite — targeted to one address; single-use; sends an email if SMTP is configured.
 *
 * useCount tracks redemptions. The invite is exhausted (usedAt set) only when
 * maxUses is set and useCount reaches it — open invites with no maxUses are permanent.
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

const createInviteSchema = z.object({
  email: z.string().email().optional(),
  maxUses: z.number().int().min(1).max(1000).optional(), // open invite use cap; null = unlimited
});

async function getTeamAdmin(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: { where: { userId } } },
  });
  if (!team) return null;
  const membership = team.members[0];
  return { team, isAdmin: membership?.role === 'co_owner' || false, isMember: !!membership };
}

export async function inviteRoutes(app: FastifyInstance) {
  // List invites for a team (admins only)
  app.get('/api/teams/:teamId/invites', { preHandler: requireAuth }, async (req, reply) => {
    const { teamId } = req.params as { teamId: string };
    const ctx = await getTeamAdmin(teamId, req.user.userId);
    if (!ctx) return reply.status(404).send({ error: 'Not found' });
    if (!ctx.isAdmin) return reply.status(403).send({ error: 'Forbidden' });

    const invites = await prisma.teamInvite.findMany({
      where: { teamId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(invites.map((i) => ({
      id: i.id,
      email: i.email,
      inviteUrl: `${config.appUrl}/invite/${i.token}`,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })));
  });

  // Create invite link (admins or members - anyone on the team can invite)
  app.post('/api/teams/:teamId/invites', { preHandler: requireAuth }, async (req, reply) => {
    const { teamId } = req.params as { teamId: string };
    const body = validate(createInviteSchema, req.body, reply);
    if (!body) return;
    const { email, maxUses } = body;

    const ctx = await getTeamAdmin(teamId, req.user.userId);
    if (!ctx) return reply.status(404).send({ error: 'Not found' });
    if (!ctx.isAdmin) return reply.status(403).send({ error: 'Forbidden' });

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Email-bound invites default to single-use; open invites are unlimited unless caller sets maxUses
    const resolvedMaxUses = email ? 1 : (maxUses ?? null);

    const invite = await prisma.teamInvite.create({
      data: { teamId, email: email?.toLowerCase().trim() ?? null, token, expiresAt, maxUses: resolvedMaxUses },
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
      inviteUrl,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      createdAt: invite.createdAt,
    });
  });

  // Revoke invite
  app.delete('/api/teams/:teamId/invites/:inviteId', { preHandler: requireAuth }, async (req, reply) => {
    const { teamId, inviteId } = req.params as { teamId: string; inviteId: string };
    const ctx = await getTeamAdmin(teamId, req.user.userId);
    if (!ctx) return reply.status(404).send({ error: 'Not found' });
    if (!ctx.isAdmin) return reply.status(403).send({ error: 'Forbidden' });
    await prisma.teamInvite.deleteMany({ where: { id: inviteId, teamId } });
    reply.send({ ok: true });
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
    reply.send({ teamId: invite.teamId, teamName: invite.team.name, email: invite.email, expiresAt: invite.expiresAt });
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

    if (invite.email) {
      const acceptingUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { email: true } });
      if (!acceptingUser || invite.email.toLowerCase() !== acceptingUser.email.toLowerCase()) {
        return reply.status(403).send({ error: 'This invite was sent to a different email address' });
      }
    }

    const newUseCount = invite.useCount + 1;
    // Exhaust the invite when maxUses is set and we hit the limit
    const isNowExhausted = invite.maxUses !== null && newUseCount >= invite.maxUses;

    // Add to team
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: invite.teamId, userId: req.user.userId } },
      create: { teamId: invite.teamId, userId: req.user.userId },
      update: {},
    });

    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { useCount: newUseCount, ...(isNowExhausted ? { usedAt: new Date() } : {}) },
    });

    logAdminEvent('INVITE_ACCEPTED', { actorName: req.user.username, targetName: invite.team.name, metadata: { inviteId: invite.id, teamId: invite.teamId, useCount: newUseCount, maxUses: invite.maxUses } });

    reply.send({ ok: true, teamId: invite.teamId, teamName: invite.team.name });
  });
}
