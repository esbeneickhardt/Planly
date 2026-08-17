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
