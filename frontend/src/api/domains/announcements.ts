/**
 * Site announcements CRUD, plus a nested `comments` sub-resource for per-announcement comments.
 */

import { request, json } from '../httpClient';
import type { AnnItem, AnnComment } from '../types';

export const announcements = {
  list: () =>
    request<{
      announcements: AnnItem[];
      canPost: boolean;
      enabled: boolean;
    }>('/api/announcements'),
  create: (data: {
    title: string;
    content: string;
    pinned?: boolean;
    teamId?: string;
    commentsEnabled?: boolean;
    postedAsRole?: string | null;
  }) =>
    request<AnnItem>('/api/announcements', {
      method: 'POST',
      body: json(data),
    }),
  update: (
    id: string,
    data: {
      title?: string;
      content?: string;
      pinned?: boolean;
      commentsEnabled?: boolean;
    },
  ) =>
    request<AnnItem>(`/api/announcements/${id}`, {
      method: 'PATCH',
      body: json(data),
    }),
  delete: (id: string) => request<{ ok: boolean }>(`/api/announcements/${id}`, { method: 'DELETE' }),
  comments: {
    list: (annId: string) =>
      request<{ comments: AnnComment[]; nextCursor: string | null }>(`/api/announcements/${annId}/comments`).then(
        (r) => r.comments,
      ),
    create: (annId: string, content: string, postedAsRole?: string | null) =>
      request<AnnComment>(`/api/announcements/${annId}/comments`, {
        method: 'POST',
        body: json({ content, postedAsRole }),
      }),
    delete: (annId: string, commentId: string) =>
      request<{ ok: boolean }>(`/api/announcements/${annId}/comments/${commentId}`, { method: 'DELETE' }),
  },
};
