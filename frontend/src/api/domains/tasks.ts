/**
 * Core task CRUD, board/milestone reordering, bulk update/delete, and prerequisite dependency
 * edges (`addDependency`/`removeDependency`).
 */

import { request, json } from '../httpClient';
import type { Task, Status } from '../../types';

export const tasks = {
  list: (productId: string) => request<Task[]>(`/api/products/${productId}/tasks`),
  create: (
    productId: string,
    data: {
      name: string;
      description?: string;
      ownerId?: string;
      color?: string;
      deadline?: string;
      canvasX?: number;
      canvasY?: number;
      status?: string;
    },
  ) =>
    request<Task>(`/api/products/${productId}/tasks`, {
      method: 'POST',
      body: json(data),
    }),
  get: (productId: string, taskId: string) => request<Task>(`/api/products/${productId}/tasks/${taskId}`),
  update: (
    productId: string,
    taskId: string,
    data: Partial<
      Pick<Task, 'name'> & {
        description: string | null;
        ownerId: string | null;
        reviewerId: string | null;
        color: string | null;
        deadline: string | null;
        status: Status;
      }
    >,
  ) =>
    request<Task>(`/api/products/${productId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: json(data),
    }),
  delete: (productId: string, taskId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/tasks/${taskId}`, {
      method: 'DELETE',
    }),
  reorder: (productId: string, updates: { taskId: string; order: number }[]) =>
    request<{ ok: boolean }>(`/api/products/${productId}/tasks/reorder`, {
      method: 'PATCH',
      body: json({ updates }),
    }),
  reorderMilestones: (productId: string, updates: { taskId: string; order: number }[]) =>
    request<{ ok: boolean }>(`/api/products/${productId}/tasks/milestone-reorder`, {
      method: 'PATCH',
      body: json({ updates }),
    }),
  bulkUpdate: (
    productId: string,
    taskIds: string[],
    data: Partial<
      Pick<Task, 'name' | 'description' | 'ownerId' | 'deadline'> & {
        status: Status;
        reviewerId: string | null;
        color: string | null;
      }
    >,
  ) =>
    request<Task[]>(`/api/products/${productId}/tasks/bulk-update`, {
      method: 'PATCH',
      body: json({ taskIds, ...data }),
    }),
  bulkDelete: (productId: string, taskIds: string[]) =>
    request<void>(`/api/products/${productId}/tasks/bulk-delete`, {
      method: 'POST',
      body: json({ taskIds }),
    }),
  // Adds a prerequisite edge: `taskId` depends on `prerequisiteId` (i.e. prerequisiteId is
  // required by taskId). Used e.g. to make a task feed into a milestone task.
  addDependency: (productId: string, taskId: string, prerequisiteId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: json({ prerequisiteId }),
    }),
  removeDependency: (productId: string, taskId: string, prerequisiteId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/tasks/${taskId}/dependencies/${prerequisiteId}`, {
      method: 'DELETE',
    }),
};
