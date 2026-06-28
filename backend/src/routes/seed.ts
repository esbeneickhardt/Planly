import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

type TaskInput = Omit<Prisma.TaskUncheckedCreateInput, 'productId' | 'createdBy'>;

export async function seedRoutes(app: FastifyInstance) {
  app.post('/api/seed-examples', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.userId;

    // Create a second demo user
    let demoUser = await prisma.user.findUnique({ where: { username: 'sara' } });
    if (!demoUser) {
      demoUser = await prisma.user.create({
        data: { username: 'sara', email: 'sara@planly.dev', passwordHash: await bcrypt.hash('demo123', 12), realName: 'Sara Chen', avatarEmoji: '👩‍💻' },
      });
    }

    // ── Product 1: Planly App ──────────────────────────────────────────
    const team1 = await prisma.team.create({
      data: { name: 'Planly Team', members: { create: [{ userId }, { userId: demoUser.id }] } },
    });
    const p1deadline = new Date(); p1deadline.setDate(p1deadline.getDate() + 90);
    const p1 = await prisma.product.create({
      data: { name: 'Planly App', emoji: '📋', description: 'A visual project management tool built around DAG planning.', deadline: p1deadline, teamId: team1.id, ownerId: userId },
    });

    const t = (data: TaskInput) =>
      prisma.task.create({ data: { ...data, productId: p1.id, createdBy: userId } });

    const p1t1 = await t({ name: 'Define core user flows', status: 'done', ownerId: userId, color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const p1t2 = await t({ name: 'Design data model', status: 'done', ownerId: demoUser.id, color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const p1t3 = await t({ name: 'Set up backend API', status: 'done', ownerId: userId, color: '#3b82f6', completedAt: new Date(), completedBy: userId });
    const p1t4 = await t({ name: 'Build Kanban board', status: 'in_progress', ownerId: userId, color: '#10b981' });
    const p1t5 = await t({ name: 'Build DAG canvas', status: 'in_progress', ownerId: demoUser.id, color: '#10b981' });
    const p1t6 = await t({ name: 'Build Gantt chart', status: 'todo', ownerId: userId, color: '#10b981' });
    const p1t7 = await t({ name: 'User testing & polish', status: 'backlog', color: '#f59e0b' });
    const p1t8 = await t({ name: 'Write documentation', status: 'backlog', color: '#f59e0b' });

    const m1deadline = new Date(); m1deadline.setDate(m1deadline.getDate() + 30);
    const m2deadline = new Date(); m2deadline.setDate(m2deadline.getDate() + 60);
    const m3deadline = new Date(); m3deadline.setDate(m3deadline.getDate() + 90);

    const p1m1 = await t({ name: 'Alpha Release', status: 'in_progress', ownerId: userId, deadline: m1deadline, color: '#f59e0b' });
    const p1m2 = await t({ name: 'Beta Release', status: 'backlog', ownerId: userId, deadline: m2deadline, color: '#f59e0b' });
    const p1m3 = await t({ name: 'v1.0 Launch', status: 'backlog', ownerId: userId, deadline: m3deadline, color: '#f59e0b' });

    // Subtasks
    await prisma.subtask.createMany({ data: [
      { taskId: p1t4.id, name: 'Drag-and-drop columns', completed: true, order: 0 },
      { taskId: p1t4.id, name: 'Card design', completed: true, order: 1 },
      { taskId: p1t4.id, name: 'Subtask fold-out', completed: false, order: 2 },
    ]});

    // Dependencies
    const dep = (dependentId: string, prerequisiteId: string) =>
      prisma.taskDependency.create({ data: { dependentId, prerequisiteId } });
    await dep(p1t3.id, p1t2.id);
    await dep(p1t4.id, p1t3.id); await dep(p1t4.id, p1t1.id);
    await dep(p1t5.id, p1t3.id);
    await dep(p1t6.id, p1t5.id);
    await dep(p1t7.id, p1t4.id); await dep(p1t7.id, p1t5.id);
    await dep(p1t8.id, p1t7.id);
    await dep(p1m1.id, p1t4.id); await dep(p1m1.id, p1t5.id);
    await dep(p1m2.id, p1t6.id); await dep(p1m2.id, p1m1.id);
    await dep(p1m3.id, p1t7.id); await dep(p1m3.id, p1t8.id); await dep(p1m3.id, p1m2.id);

    // ── Product 2: Mobile App ──────────────────────────────────────────
    const team2 = await prisma.team.create({
      data: { name: 'Mobile Team', members: { create: [{ userId }, { userId: demoUser.id }] } },
    });
    const p2deadline = new Date(); p2deadline.setDate(p2deadline.getDate() + 120);
    const p2 = await prisma.product.create({
      data: { name: 'Mobile App', emoji: '📱', description: 'Cross-platform mobile app for iOS and Android.', deadline: p2deadline, teamId: team2.id, ownerId: userId },
    });

    const t2 = (data: TaskInput) =>
      prisma.task.create({ data: { ...data, productId: p2.id, createdBy: userId } });

    const p2t1 = await t2({ name: 'Market research', status: 'done', ownerId: demoUser.id, color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const p2t2 = await t2({ name: 'Wireframes & design', status: 'done', ownerId: demoUser.id, color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const p2t3 = await t2({ name: 'Core navigation', status: 'in_progress', ownerId: userId, color: '#3b82f6' });
    const p2t4 = await t2({ name: 'User authentication', status: 'in_progress', ownerId: demoUser.id, color: '#3b82f6' });
    const p2t5 = await t2({ name: 'Push notifications', status: 'todo', ownerId: userId, color: '#10b981' });
    const p2t6 = await t2({ name: 'Offline mode', status: 'todo', ownerId: demoUser.id, color: '#10b981' });
    const p2t7 = await t2({ name: 'App Store submission', status: 'backlog', color: '#f59e0b' });
    const p2t8 = await t2({ name: 'Analytics integration', status: 'blocked', ownerId: userId, color: '#ef4444' });

    const m4deadline = new Date(); m4deadline.setDate(m4deadline.getDate() + 45);
    const m5deadline = new Date(); m5deadline.setDate(m5deadline.getDate() + 120);
    const p2m1 = await t2({ name: 'Prototype Release', status: 'in_progress', ownerId: userId, deadline: m4deadline, color: '#f59e0b' });
    const p2m2 = await t2({ name: 'App Store Launch', status: 'backlog', ownerId: userId, deadline: m5deadline, color: '#f59e0b' });

    await dep(p2t2.id, p2t1.id);
    await dep(p2t3.id, p2t2.id);
    await dep(p2t4.id, p2t3.id);
    await dep(p2t5.id, p2t3.id);
    await dep(p2t6.id, p2t4.id);
    await dep(p2t7.id, p2t5.id); await dep(p2t7.id, p2t6.id);
    await dep(p2t8.id, p2t4.id);
    await dep(p2m1.id, p2t3.id); await dep(p2m1.id, p2t4.id);
    await dep(p2m2.id, p2t7.id); await dep(p2m2.id, p2t8.id);

    reply.send({ ok: true, products: [p1.id, p2.id] });
  });
}
