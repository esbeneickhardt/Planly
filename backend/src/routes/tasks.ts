/**
 * Task routes barrel — registers all task-related sub-plugins.
 *
 * Split into:
 *   tasks/crud.ts         — list, create, get, update, delete, reorder, canvas position
 *   tasks/subtasks.ts     — subtask CRUD
 *   tasks/dependencies.ts — DAG edges + graph endpoint
 */
import { FastifyInstance } from 'fastify';
import { taskCrudRoutes } from './tasks/crud';
import { subtaskRoutes } from './tasks/subtasks';
import { dependencyRoutes } from './tasks/dependencies';

export async function taskRoutes(app: FastifyInstance) {
  await app.register(taskCrudRoutes);
  await app.register(subtaskRoutes);
  await app.register(dependencyRoutes);
}
