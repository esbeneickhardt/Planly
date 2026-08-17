/**
 * Per-product calendar feed token management. `feedUrl` builds the public .ics subscription URL
 * client-side rather than going through `request()` - it's meant to be copied/opened, not fetched.
 */

import { request, json } from '../httpClient';

export const calendar = {
  getTokenStatus: (productId: string) =>
    request<{ hasToken: boolean; createdAt: string | null }>(`/api/products/${productId}/calendar/token`),
  generateToken: (productId: string) =>
    request<{ token: string }>(`/api/products/${productId}/calendar/token`, {
      method: 'POST',
      body: json({}),
    }),
  revokeToken: (productId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/calendar/token`, {
      method: 'DELETE',
    }),
  feedUrl: (productId: string, token: string) =>
    `${window.location.origin}/api/products/${productId}/calendar.ics?token=${encodeURIComponent(token)}`,
};
