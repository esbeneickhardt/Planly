/**
 * CRUD and reactions for the single site-wide admin chat channel - distinct from per-product
 * `messages` and the 1:1/group `conversations` (which also has its own admin-chat mode).
 */

import { request, json } from '../httpClient';
import type { Message } from '../types';

export const adminChat = {
  list: (cursor?: string, query?: string, opts?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (query) params.set('q', query);
    if (opts?.before) params.set('before', opts.before);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return request<Message[]>(`/api/admin/chat${qs ? `?${qs}` : ''}`);
  },
  create: (data: {
    content: string;
    replyToId?: string | null;
    attachments?: { url: string; name: string; type: string }[];
    postedAsRole?: string | null;
  }) => request<Message>('/api/admin/chat', { method: 'POST', body: json(data) }),
  update: (messageId: string, content: string) =>
    request<Message>(`/api/admin/chat/${messageId}`, { method: 'PATCH', body: json({ content }) }),
  delete: (messageId: string) => request<{ ok: boolean }>(`/api/admin/chat/${messageId}`, { method: 'DELETE' }),
  toggleReaction: (messageId: string, emoji: string) =>
    request<{ reactions: { emoji: string; userId: string }[] }>(`/api/admin/chat/${messageId}/reactions`, {
      method: 'POST',
      body: json({ emoji }),
    }),
};
