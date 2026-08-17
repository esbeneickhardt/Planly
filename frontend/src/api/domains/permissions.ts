/**
 * Per-product, per-tab permission levels: list and full replace.
 */

import { request, json } from '../httpClient';

export const permissions = {
  list: (productId: string) =>
    request<{ id: string; userId: string; tab: string; level: string }[]>(`/api/products/${productId}/permissions`),
  put: (productId: string, updates: { userId: string; tab: string; level: string }[]) =>
    request<{ ok: boolean }>(`/api/products/${productId}/permissions`, {
      method: 'PUT',
      body: json(updates),
    }),
};
