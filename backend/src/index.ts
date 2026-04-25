import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { teamRoutes } from './routes/teams';
import { productRoutes } from './routes/products';
import { taskRoutes } from './routes/tasks';
import { milestoneRoutes } from './routes/milestones';
import { columnRoutes } from './routes/columns';
import { seedRoutes } from './routes/seed';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  await app.register(cookie);

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(productRoutes);
  await app.register(taskRoutes);
  await app.register(milestoneRoutes);
  await app.register(columnRoutes);
  await app.register(seedRoutes);

  app.get('/api/health', async () => ({ ok: true }));

  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
