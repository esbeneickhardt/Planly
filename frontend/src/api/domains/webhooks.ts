/**
 * Per-product outgoing webhooks: CRUD, secret rotation, and delivery history.
 */

import { request, json } from '../httpClient';
import type { Webhook, WebhookDelivery } from '../types';

export const webhooks = {
  list: (productId: string) => request<Webhook[]>(`/api/products/${productId}/webhooks`),
  create: (productId: string, data: { url: string; events: string[] }) =>
    request<Webhook & { secret: string }>(`/api/products/${productId}/webhooks`, {
      method: 'POST',
      body: json(data),
    }),
  update: (productId: string, webhookId: string, data: { url?: string; events?: string[]; active?: boolean }) =>
    request<Webhook>(`/api/products/${productId}/webhooks/${webhookId}`, {
      method: 'PATCH',
      body: json(data),
    }),
  delete: (productId: string, webhookId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/webhooks/${webhookId}`, { method: 'DELETE' }),
  rotateSecret: (productId: string, webhookId: string) =>
    request<{ secret: string }>(`/api/products/${productId}/webhooks/${webhookId}/rotate-secret`, {
      method: 'POST',
      body: json({}),
    }),
  deliveries: (productId: string, webhookId: string) =>
    request<WebhookDelivery[]>(`/api/products/${productId}/webhooks/${webhookId}/deliveries`),
};
