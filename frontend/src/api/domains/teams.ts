import { request, json } from '../httpClient';
import type { Team } from '../../types';

export const teams = {
  list: () => request<Team[]>('/api/teams'),
  create: (data: { name: string }) => request<Team>('/api/teams', { method: 'POST', body: json(data) }),
  get: (id: string) => request<Team>(`/api/teams/${id}`),
  update: (id: string, data: { name?: string }) =>
    request<Team>(`/api/teams/${id}`, { method: 'PATCH', body: json(data) }),
  addMember: (id: string, userId: string) =>
    request<{ ok: boolean }>(`/api/teams/${id}/members`, { method: 'POST', body: json({ userId }) }),
  removeMember: (id: string, userId: string) =>
    request<{ ok: boolean }>(`/api/teams/${id}/members/${userId}`, { method: 'DELETE' }),
  setMemberRole: (teamId: string, userId: string, role: 'member' | 'co_owner') =>
    request<{ ok: boolean }>(`/api/teams/${teamId}/members/${userId}/role`, {
      method: 'PATCH',
      body: json({ role }),
    }),
  delete: (id: string) => request<{ ok: boolean }>(`/api/teams/${id}`, { method: 'DELETE' }),
};
