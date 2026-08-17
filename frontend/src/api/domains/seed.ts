import { request, json } from '../httpClient';

export const seed = {
  examples: () => request<{ ok: boolean; products: string[] }>('/api/seed-examples', { method: 'POST', body: json({}) }),
};
