/**
 * Seeds example demo products for the current user (used by onboarding/demo flows).
 */

import { request, json } from '../httpClient';

export const seed = {
  examples: () => request<{ ok: boolean; products: string[] }>('/api/seed-examples', { method: 'POST', body: json({}) }),
};
