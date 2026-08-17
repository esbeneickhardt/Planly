/**
 * GitHub integration config: webhook URL/secret and import settings (issues/PRs, default product).
 */

import { request, json } from '../httpClient';

export const github = {
  getConfig: () =>
    request<{
      webhookUrl: string;
      hasSecret: boolean;
      githubImportIssues: boolean;
      githubImportPrs: boolean;
      githubDefaultProductId: string | null;
    }>('/api/github/config'),
  updateConfig: (data: {
    githubImportIssues?: boolean;
    githubImportPrs?: boolean;
    githubDefaultProductId?: string | null;
  }) =>
    request<{ ok: boolean }>('/api/github/config', {
      method: 'POST',
      body: json(data),
    }),
  regenerateSecret: () =>
    request<{ secret: string }>('/api/github/regenerate-secret', {
      method: 'POST',
      body: json({}),
    }),
};
