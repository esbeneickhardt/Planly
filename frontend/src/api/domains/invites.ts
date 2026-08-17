import { request, json } from '../httpClient';
import type { TeamInvite, PendingInvite, InviteInfo } from '../types';

export const invites = {
  list: (teamId: string) => request<TeamInvite[]>(`/api/teams/${teamId}/invites`),
  create: (teamId: string, email?: string) =>
    request<TeamInvite>(`/api/teams/${teamId}/invites`, { method: 'POST', body: json({ email }) }),
  revoke: (teamId: string, inviteId: string) =>
    request<{ ok: boolean }>(`/api/teams/${teamId}/invites/${inviteId}`, { method: 'DELETE' }),
  getInfo: (token: string) => request<InviteInfo>(`/api/invites/${token}`),
  pending: () => request<PendingInvite[]>('/api/invites/pending'),
  accept: (token: string) =>
    request<{ ok: boolean; teamId: string; teamName: string }>(`/api/invites/${token}/accept`, {
      method: 'POST',
      body: json({}),
    }),
  decline: (token: string) => request<{ ok: boolean }>(`/api/invites/${token}/decline`, { method: 'POST', body: json({}) }),
};
