import { request, json } from '../httpClient';
import type { Message } from '../types';

export const messages = {
  list: (productId: string, taskId?: string) =>
    request<Message[]>(`/api/products/${productId}/messages${taskId ? `?taskId=${taskId}` : ''}`),
  listAll: (productId: string, opts?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams({ all: 'true' });
    if (opts?.before) params.set('before', opts.before);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return request<Message[]>(`/api/products/${productId}/messages?${params.toString()}`);
  },
  create: (
    productId: string,
    data: {
      content: string;
      taskId?: string;
      replyToId?: string | null;
      attachments?: { url: string; name: string; type: string }[];
      postedAsRole?: string | null;
    },
  ) => request<Message>(`/api/products/${productId}/messages`, { method: 'POST', body: json(data) }),
  update: (productId: string, messageId: string, content: string) =>
    request<Message>(`/api/products/${productId}/messages/${messageId}`, {
      method: 'PATCH',
      body: json({ content }),
    }),
  delete: (productId: string, messageId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/messages/${messageId}`, { method: 'DELETE' }),
  toggleReaction: (productId: string, messageId: string, emoji: string) =>
    request<{ reactions: { emoji: string; userId: string }[] }>(
      `/api/products/${productId}/messages/${messageId}/reactions`,
      { method: 'POST', body: json({ emoji }) },
    ),
};
