import { request, json } from '../httpClient';
import type { Subtask } from '../../types';

export const subtasks = {
  create: (productId: string, taskId: string, name: string) =>
    request<Subtask>(`/api/products/${productId}/tasks/${taskId}/subtasks`, { method: 'POST', body: json({ name }) }),
  update: (
    productId: string,
    taskId: string,
    subtaskId: string,
    data: Partial<Pick<Subtask, 'name' | 'completed' | 'order'>>,
  ) =>
    request<Subtask>(`/api/products/${productId}/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: json(data),
    }),
  delete: (productId: string, taskId: string, subtaskId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: 'DELETE',
    }),
};
