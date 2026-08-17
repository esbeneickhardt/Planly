/**
 * Access-request endpoints for private products: listing/deciding pending requests to join,
 * submitting a request, and discovering public products via `discover()`.
 */

import { request, json } from '../httpClient';
import type { Product } from '../../types';

export const accessRequests = {
  list: (productId: string) =>
    request<
      {
        id: string;
        userId: string;
        status: string;
        note: string | null;
        createdAt: string;
        user: {
          id: string;
          username: string;
          avatarEmoji: string | null;
          realName: string | null;
        };
      }[]
    >(`/api/products/${productId}/access-requests`),
  request: (productId: string, note?: string) =>
    request<{ id: string; status: string }>(`/api/products/${productId}/access-requests`, {
      method: 'POST',
      body: json({ note }),
    }),
  decide: (productId: string, requestId: string, action: 'approve' | 'reject') =>
    request<{ ok: boolean }>(`/api/products/${productId}/access-requests/${requestId}`, {
      method: 'PATCH',
      body: json({ action }),
    }),
  discover: () =>
    request<{
      products: (Product & { requestStatus: string | null })[];
      nextCursor: string | null;
    }>('/api/products/discover').then((r) => r.products),
};
