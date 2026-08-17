/**
 * Direct-message and group conversations: listing, creation (1:1 and group), messages, read
 * state, and participant management. The `adminChat` flag switches these same endpoints between
 * a product's DMs and the admin-chat DM roster - it's unrelated to the `adminChat.ts` channel.
 */

import { request, json } from '../httpClient';
import type { ConversationSummary, DirectMessage } from '../types';

export const conversations = {
  // Non-admin (project) chat is always scoped to one project - productId is required whenever
  // adminChat isn't set, mirroring the backend's own requirement.
  list: (adminChat?: boolean, productId?: string) =>
    request<{ conversations: ConversationSummary[] }>(
      `/api/conversations?${adminChat ? 'admin=true' : `productId=${encodeURIComponent(productId ?? '')}`}`,
    ),
  findOrCreate: (participantId: string, isAdminChat?: boolean, productId?: string) =>
    request<{ id: string }>('/api/conversations', {
      method: 'POST',
      body: json({
        participantId,
        isAdminChat: isAdminChat ?? false,
        productId,
      }),
    }),
  messages: (id: string) => request<{ messages: DirectMessage[] }>(`/api/conversations/${id}/messages`),
  send: (id: string, content: string, replyToId?: string | null) =>
    request<DirectMessage>(`/api/conversations/${id}/messages`, {
      method: 'POST',
      body: json({ content, replyToId: replyToId ?? null }),
    }),
  markRead: (id: string) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/read`, {
      method: 'PATCH',
      body: json({}),
    }),
  close: (id: string) =>
    request<{ ok: boolean; closed: boolean }>(`/api/conversations/${id}/close`, { method: 'PATCH', body: json({}) }),
  unreadCount: (adminChat?: boolean, productId?: string) =>
    request<{ count: number }>(
      `/api/conversations/unread-count?${adminChat ? 'admin=true' : `productId=${encodeURIComponent(productId ?? '')}`}`,
    ),
  createGroup: (participantIds: string[], name?: string, isAdminChat?: boolean, productId?: string) =>
    request<{ id: string }>('/api/conversations/group', {
      method: 'POST',
      body: json({
        participantIds,
        name,
        isAdminChat: isAdminChat ?? false,
        productId,
      }),
    }),
  rename: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/rename`, {
      method: 'PATCH',
      body: json({ name }),
    }),
  addParticipants: (id: string, userIds: string[]) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/participants`, {
      method: 'POST',
      body: json({ userIds }),
    }),
  removeParticipant: (id: string, userId: string) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/participants/${userId}`, { method: 'DELETE' }),
};
