import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { createHash } from 'crypto';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/tmp/planly-uploads';

const AUTHOR_SELECT = { id: true, username: true, avatarEmoji: true };

export async function messageRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // Ensure uploads dir exists
  await mkdir(UPLOADS_DIR, { recursive: true });

  // Upload a file, return its URL
  app.post('/api/upload', { preHandler: requireAuth }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });
    const buf = await data.toBuffer();
    const ext = data.filename.split('.').pop() ?? 'bin';
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const filename = `${hash}.${ext}`;
    await writeFile(join(UPLOADS_DIR, filename), buf);
    reply.send({ url: `/api/uploads/${filename}`, name: data.filename, type: data.mimetype });
  });

  // Serve uploaded files
  app.get('/api/uploads/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    try {
      const buf = await readFile(join(UPLOADS_DIR, safe));
      const ext = safe.split('.').pop()?.toLowerCase() ?? '';
      const mime: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
      reply.header('Content-Type', mime[ext] ?? 'application/octet-stream').send(buf);
    } catch {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  // List messages (for a product, optionally filtered by taskId, or all=true for all product messages)
  app.get('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { taskId, all } = req.query as { taskId?: string; all?: string };
    const where = all === 'true' ? { productId } : { productId, taskId: taskId ?? null };
    const messages = await prisma.message.findMany({
      where,
      include: {
        author: { select: AUTHOR_SELECT },
        task: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    reply.send(messages);
  });

  // Post a message
  app.post('/api/products/:productId/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const { content, taskId, attachments } = req.body as {
      content: string;
      taskId?: string;
      attachments?: { url: string; name: string; type: string }[];
    };
    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });
    const msg = await prisma.message.create({
      data: {
        productId,
        taskId: taskId ?? null,
        authorId: req.user.userId,
        content: content.trim(),
        attachments: attachments ?? [],
      },
      include: { author: { select: AUTHOR_SELECT } },
    });
    reply.status(201).send(msg);
  });

  // Edit own message
  app.patch('/api/products/:productId/messages/:messageId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    const { content } = req.body as { content: string };
    const msg = await prisma.message.findFirst({ where: { id: messageId, productId } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: { author: { select: AUTHOR_SELECT } },
    });
    reply.send(updated);
  });

  // Delete own message
  app.delete('/api/products/:productId/messages/:messageId', { preHandler: requireAuth }, async (req, reply) => {
    const { productId, messageId } = req.params as { productId: string; messageId: string };
    const msg = await prisma.message.findFirst({ where: { id: messageId, productId } });
    if (!msg) return reply.status(404).send({ error: 'Not found' });
    if (msg.authorId !== req.user.userId) return reply.status(403).send({ error: 'Not your message' });
    await prisma.message.delete({ where: { id: messageId } });
    reply.send({ ok: true });
  });
}
