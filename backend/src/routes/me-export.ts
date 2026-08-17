/**
 * Personal data export route (GDPR portability) - returns a complete JSON
 * document of all data the platform holds about the authenticated user.
 *
 * Includes profile, notification preferences, team memberships, tasks, comments,
 * messages, and API tokens (names only, not secrets). PII fields are decrypted.
 * Intended for data-portability requests under GDPR Article 20.
 */
import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { decryptUserPii } from '../utils/crypto';

// GDPR data-portability export - returns everything the platform holds about
// the authenticated user as a single JSON document.
export async function meExportRoutes(app: FastifyInstance) {
  app.get('/api/me/export', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;

    // Fetch all user data across tables in parallel
    const [user, tasks, messages, notifications, apiTokens, announcements, comments, accessRequests, teamMemberships] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            email: true,
            realName: true,
            phone: true,
            avatarEmoji: true,
            avatarUrl: true,
            emailVerified: true,
            ssoProvider: true,
            createdAt: true,
            notificationPreferences: true,
          },
        }),
        prisma.task.findMany({
          where: {
            deletedAt: null,
            OR: [{ createdBy: userId }, { ownerId: userId }, { reviewerId: userId }],
          },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            createdAt: true,
            deadline: true,
            productId: true,
            ownerId: true,
            reviewerId: true,
            createdBy: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.message.findMany({
          where: { authorId: userId },
          select: {
            id: true,
            content: true,
            createdAt: true,
            productId: true,
            taskId: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.findMany({
          where: { userId },
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            read: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.apiToken.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            createdAt: true,
            expiresAt: true,
            lastUsedAt: true,
            productId: true,
          },
        }),
        prisma.announcement.findMany({
          where: { authorId: userId },
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            pinned: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.announcementComment.findMany({
          where: { authorId: userId },
          select: {
            id: true,
            content: true,
            createdAt: true,
            announcementId: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.accessRequest.findMany({
          where: { userId },
          select: {
            id: true,
            productId: true,
            status: true,
            note: true,
            createdAt: true,
          },
        }),
        prisma.teamMember.findMany({
          where: { userId },
          select: {
            teamId: true,
            role: true,
            team: { select: { id: true, name: true } },
          },
        }),
      ]);

    // Return as a named JSON attachment with PII fields decrypted
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="planly-export-${userId}.json"`)
      .send(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            profile: user ? decryptUserPii(user) : null,
            tasks,
            messages,
            notifications,
            apiTokens,
            announcements,
            announcementComments: comments,
            accessRequests,
            teamMemberships,
          },
          null,
          2,
        ),
      );
  });
}
