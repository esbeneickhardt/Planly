import { request, json } from '../httpClient';
import type { User } from '../../types';

export const users = {
  list: () =>
    request<{
      users: {
        id: string;
        username: string;
        realName: string | null;
        avatarEmoji: string | null;
        acceptsInvites: boolean;
        isAdmin: boolean;
      }[];
      nextCursor: string | null;
    }>('/api/users').then((r) => r.users),
  create: (data: {
    username: string;
    email: string;
    password: string;
    realName?: string;
    avatarEmoji?: string;
    tosAccepted: true;
  }) => request<User>('/api/users', { method: 'POST', body: json(data) }),
  get: (id: string) => request<User>(`/api/users/${id}`),
  getProfile: (id: string) =>
    request<{
      id: string;
      username: string;
      realName: string | null;
      avatarEmoji: string | null;
      projects: { id: string; name: string; emoji?: string; role: string }[];
      // False when the target has set showProjectsOnProfile to off (and this isn't their own
      // profile) - lets the UI distinguish "hidden by privacy setting" from "genuinely no projects".
      projectsVisible: boolean;
    }>(`/api/users/${id}/profile`),
  update: (
    id: string,
    data: Partial<
      Pick<User, 'realName' | 'phone' | 'avatarEmoji' | 'avatarUrl'> & {
        acceptsInvites: boolean;
        showProjectsOnProfile: boolean;
      }
    >,
  ) => request<User>(`/api/users/${id}`, { method: 'PATCH', body: json(data) }),
  updateNotificationPreferences: (id: string, preferences: Record<string, boolean>) =>
    request<{ notificationPreferences: Record<string, boolean> }>(`/api/users/${id}/notification-preferences`, {
      method: 'PATCH',
      body: json({ preferences }),
    }),
  delete: (id: string) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
};
