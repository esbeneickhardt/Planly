import { request, json } from '../httpClient';
import type { Product } from '../../types';

export const products = {
  list: () => request<Product[]>('/api/products'),
  create: (data: { name: string; deadline: string; teamId: string; emoji?: string; description?: string }) =>
    request<Product>('/api/products', { method: 'POST', body: json(data) }),
  get: (id: string) => request<Product>(`/api/products/${id}`),
  getAbout: (id: string) =>
    request<
      Pick<Product, 'id' | 'name' | 'emoji' | 'description' | 'deadline' | 'status'> & {
        members: {
          userId: string;
          role: string;
          user: { id: string; username: string; realName: string | null; avatarEmoji: string | null };
        }[];
      }
    >(`/api/products/${id}/about`),
  update: (
    id: string,
    data: Partial<
      Pick<
        Product,
        'name' | 'emoji' | 'description' | 'deadline' | 'ownerId' | 'analyticsEnabled' | 'discoverable' | 'status'
      >
    >,
  ) => request<Product>(`/api/products/${id}`, { method: 'PATCH', body: json(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),
  duplicate: (id: string) => request<Product>(`/api/products/${id}/duplicate`, { method: 'POST' }),
};
