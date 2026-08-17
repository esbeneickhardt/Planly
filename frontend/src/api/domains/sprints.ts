import { request, json } from '../httpClient';
import type { Sprint } from '../types';

export const sprints = {
  list: (productId: string) => request<Sprint[]>(`/api/products/${productId}/sprints`),
  create: (
    productId: string,
    data: { name: string; startDate: string; endDate: string; color?: string; taskIds?: string[] },
  ) => request<Sprint>(`/api/products/${productId}/sprints`, { method: 'POST', body: json(data) }),
  update: (
    productId: string,
    sprintId: string,
    data: { name?: string; startDate?: string; endDate?: string; color?: string },
  ) => request<Sprint>(`/api/products/${productId}/sprints/${sprintId}`, { method: 'PATCH', body: json(data) }),
  delete: (productId: string, sprintId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/sprints/${sprintId}`, { method: 'DELETE' }),
  addTasks: (productId: string, sprintId: string, taskIds: string[]) =>
    request<{ ok: boolean; added: number }>(`/api/products/${productId}/sprints/${sprintId}/tasks`, {
      method: 'POST',
      body: json({ taskIds }),
    }),
  removeTask: (productId: string, sprintId: string, taskId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/sprints/${sprintId}/tasks/${taskId}`, { method: 'DELETE' }),
};
