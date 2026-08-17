/**
 * User notifications: paginated list, several unread-count variants (overall, by task, by
 * product, with type filters), mark-read, and delete.
 */

import { request, json } from '../httpClient';
import type { Notification } from '../types';

export const notifications = {
  list: (cursor?: string, productId?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (productId) params.set('productId', productId);
    const qs = params.toString();
    return request<{
      notifications: Notification[];
      nextCursor: string | null;
    }>(`/api/notifications${qs ? `?${qs}` : ''}`);
  },
  unreadCount: (productId?: string, opts?: { types?: string[]; excludeTypes?: string[] }) => {
    const params = new URLSearchParams();
    if (productId) params.set('productId', productId);
    if (opts?.types?.length) params.set('types', opts.types.join(','));
    if (opts?.excludeTypes?.length) params.set('excludeTypes', opts.excludeTypes.join(','));
    const qs = params.toString();
    return request<{ count: number }>(`/api/notifications/unread-count${qs ? `?${qs}` : ''}`);
  },
  unreadByTask: (productId: string) => {
    const params = new URLSearchParams({ productId });
    return request<{ general: number; byTask: Record<string, number> }>(
      `/api/notifications/unread-by-task?${params.toString()}`,
    );
  },
  unreadByProduct: (opts?: { excludeTypes?: string[] }) => {
    const params = new URLSearchParams();
    if (opts?.excludeTypes?.length) params.set('excludeTypes', opts.excludeTypes.join(','));
    const qs = params.toString();
    return request<{ byProduct: Record<string, number>; total: number }>(
      `/api/notifications/unread-by-product${qs ? `?${qs}` : ''}`,
    );
  },
  markRead: (ids: string[]) =>
    request<{ ok: boolean }>('/api/notifications/read', {
      method: 'PATCH',
      body: json({ ids }),
    }),
  markAllRead: (opts?: { types?: string[]; excludeTypes?: string[]; taskId?: string | null }) =>
    request<{ ok: boolean }>('/api/notifications/read-all', {
      method: 'POST',
      body: json(opts ?? {}),
    }),
  delete: (id: string) => request<{ ok: boolean }>(`/api/notifications/${id}`, { method: 'DELETE' }),
  clearAll: () => request<{ ok: boolean }>('/api/notifications', { method: 'DELETE' }),
};
