/**
 * Kanban column CRUD and reordering for a product's board.
 */

import { request, json } from '../httpClient';
import type { KanbanColumn } from '../../types';

export const columns = {
  list: (productId: string) => request<KanbanColumn[]>(`/api/products/${productId}/columns`),
  create: (productId: string, data: { label: string; color?: string }) =>
    request<KanbanColumn>(`/api/products/${productId}/columns`, { method: 'POST', body: json(data) }),
  update: (productId: string, columnId: string, data: { label?: string; color?: string }) =>
    request<KanbanColumn>(`/api/products/${productId}/columns/${columnId}`, { method: 'PATCH', body: json(data) }),
  delete: (productId: string, columnId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/columns/${columnId}`, { method: 'DELETE' }),
  reorder: (productId: string, order: { id: string; order: number }[]) =>
    request<{ ok: boolean }>(`/api/products/${productId}/columns/reorder`, {
      method: 'PATCH',
      body: json({ order }),
    }),
};
