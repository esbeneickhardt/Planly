import { request, json } from '../httpClient';

export const connections = {
  list: (productId: string) => request<string[]>(`/api/products/${productId}/connections`),
  add: (productId: string, taskId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/connections`, { method: 'POST', body: json({ taskId }) }),
  remove: (productId: string, taskId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/connections/${taskId}`, { method: 'DELETE' }),
};
