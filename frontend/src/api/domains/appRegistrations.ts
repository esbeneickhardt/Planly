/**
 * Registered integration apps: CRUD on the app registration itself, its own scoped API tokens
 * (separate from the user's personal `apiTokens`), and its permission grants.
 */

import { request, json } from '../httpClient';
import type { ApiToken, AppRegistration, AppPermissions } from '../types';

export const appRegistrations = {
  list: () => request<AppRegistration[]>('/api/apps'),
  create: (data: { name: string; description?: string }) =>
    request<AppRegistration>('/api/apps', { method: 'POST', body: json(data) }),
  update: (appId: string, data: { name?: string; description?: string }) =>
    request<AppRegistration>(`/api/apps/${appId}`, { method: 'PATCH', body: json(data) }),
  delete: (appId: string) => request<{ ok: boolean }>(`/api/apps/${appId}`, { method: 'DELETE' }),
  listTokens: (appId: string) => request<ApiToken[]>(`/api/apps/${appId}/tokens`),
  createToken: (appId: string, data: { name: string; expiresAt?: string }) =>
    request<ApiToken & { token: string }>(`/api/apps/${appId}/tokens`, { method: 'POST', body: json(data) }),
  deleteToken: (appId: string, tokenId: string) =>
    request<{ ok: boolean }>(`/api/apps/${appId}/tokens/${tokenId}`, { method: 'DELETE' }),
  updatePermissions: (appId: string, permissions: AppPermissions) =>
    request<AppRegistration>(`/api/apps/${appId}/permissions`, { method: 'PATCH', body: json(permissions) }),
};
