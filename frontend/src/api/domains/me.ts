/**
 * The current user's per-product permission grants across every product they belong to.
 */

import { request } from '../httpClient';

export const me = {
  permissions: () =>
    request<
      Array<{
        productId: string;
        productName: string;
        productEmoji: string | null;
        role: string;
        permissions: Record<string, string>;
      }>
    >('/api/me/permissions'),
};
