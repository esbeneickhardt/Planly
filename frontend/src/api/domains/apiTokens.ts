/**
 * Personal API token (PAT) management for the current user.
 */

import { request, json } from '../httpClient';
import type { ApiToken } from '../types';

export const apiTokens = {
  list: () => request<ApiToken[]>('/api/auth/tokens'),
  create: (data: { name: string; expiresAt?: string; readOnly?: boolean }) =>
    request<ApiToken & { token: string }>('/api/auth/tokens', {
      method: 'POST',
      body: json(data),
    }),
  delete: (tokenId: string) =>
    request<{ ok: boolean }>(`/api/auth/tokens/${tokenId}`, {
      method: 'DELETE',
    }),
};
