import { request, getCsrfToken } from '../httpClient';
import type { MessageAttachment } from '../types';

export const upload = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  const csrf = getCsrfToken();
  return fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    body: form,
  }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
    }
    return r.json() as Promise<MessageAttachment>;
  });
};

export const deleteUpload = (filename: string) =>
  request<{ ok: boolean }>(`/api/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
