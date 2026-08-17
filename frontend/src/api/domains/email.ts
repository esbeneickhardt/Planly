import { request, json } from '../httpClient';

export const emailStatus = {
  get: () =>
    request<{
      enabled: boolean;
      from: string | null;
      config: { host: string; port: number; secure: boolean; user: string; from: string } | null;
    }>('/api/email-status'),
  test: () => request<{ ok: boolean }>('/api/email-status/test', { method: 'POST', body: json({}) }),
};

export const emailConfig = {
  get: () =>
    request<{ host: string; port: number; secure: boolean; user: string; from: string } | null>('/api/email-config'),
  save: (data: { host: string; port: number; secure: boolean; user: string; pass?: string; from: string }) =>
    request<{ ok: boolean }>('/api/email-config', { method: 'PUT', body: json(data) }),
  clear: () => request<{ ok: boolean }>('/api/email-config', { method: 'DELETE' }),
};
