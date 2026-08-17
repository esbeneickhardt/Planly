/**
 * Site-admin panel endpoints: user management (promote/demote/lock/reset), the site
 * allow/deny whitelist, server config, audit logs (list/export/prune), and project moderation
 * (list/status/restore/hard-delete). `ipRestrictions` and `adminIpRestrictions` are two distinct
 * rule sets - general site access vs. the admin panel itself - each with parallel CRUD endpoints.
 */

import { request, json } from '../httpClient';
import type { Message } from '../types';

export const admin = {
  users: () =>
    request<
      {
        id: string;
        username: string;
        email: string;
        isAdmin: boolean;
        isFoundingAdmin: boolean;
        emailVerified: boolean;
        createdAt: string;
        failedLoginAttempts: number;
        loginLockedUntil: string | null;
        lastLoginAt: string | null;
        lastActiveAt: string | null;
      }[]
    >('/api/admin/users'),
  promote: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}/promote`, {
      method: 'PUT',
      body: json({}),
    }),
  demote: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}/demote`, {
      method: 'PUT',
      body: json({}),
    }),
  transferCrown: (userId: string) =>
    request<{ ok: boolean }>('/api/admin/transfer-crown', {
      method: 'PUT',
      body: json({ userId }),
    }),
  verifyEmail: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}/verify-email`, {
      method: 'PUT',
      body: json({}),
    }),
  deleteUser: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    }),
  unlock: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}/unlock`, {
      method: 'PUT',
      body: json({}),
    }),
  forceLogout: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}/force-logout`, {
      method: 'PUT',
      body: json({}),
    }),
  resetPassword: (userId: string) =>
    request<{ ok: boolean; tempPassword: string }>(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: json({}),
    }),
  whitelist: () => request<{ id: string; pattern: string; type: string; createdAt: string }[]>('/api/admin/whitelist'),
  addWhitelist: (pattern: string, type: 'allow' | 'deny' = 'allow') =>
    request<{ id: string; pattern: string; type: string; createdAt: string }>('/api/admin/whitelist', {
      method: 'POST',
      body: json({ pattern, type }),
    }),
  removeWhitelist: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/whitelist/${id}`, {
      method: 'DELETE',
    }),
  serverConfig: () =>
    request<{
      adminEmail: string | null;
      requireEmailVerification: boolean;
      requireWhitelist: boolean;
      requireBlocklist: boolean;
      allowProjectCreation: boolean;
      announcementsEnabled: boolean;
      announcementPostRole: string;
      requireMfa: boolean;
    }>('/api/admin/server-config'),
  updateServerConfig: (data: {
    requireEmailVerification?: boolean;
    requireWhitelist?: boolean;
    requireBlocklist?: boolean;
    allowProjectCreation?: boolean;
    announcementsEnabled?: boolean;
    announcementPostRole?: string;
    requireMfa?: boolean;
  }) =>
    request<{ ok: boolean; verificationEmailsSent?: number }>('/api/admin/server-config', {
      method: 'PUT',
      body: json(data),
    }),
  ipRestrictions: () =>
    request<{
      allowlistRules: {
        id: string;
        cidr: string;
        listType: string;
        description: string | null;
        createdAt: string;
      }[];
      blocklistRules: {
        id: string;
        cidr: string;
        listType: string;
        description: string | null;
        createdAt: string;
      }[];
      yourIp: string;
    }>('/api/admin/ip-restrictions'),
  addIpRule: (cidr: string, listType: 'allowlist' | 'blocklist', description?: string) =>
    request<{
      id: string;
      cidr: string;
      listType: string;
      description: string | null;
      createdAt: string;
    }>('/api/admin/ip-restrictions', {
      method: 'POST',
      body: json({ cidr, listType, description }),
    }),
  removeIpRule: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/ip-restrictions/${id}`, {
      method: 'DELETE',
    }),
  adminIpRestrictions: () =>
    request<{
      allowlistRules: {
        id: string;
        cidr: string;
        listType: string;
        description: string | null;
        createdAt: string;
      }[];
      blocklistRules: {
        id: string;
        cidr: string;
        listType: string;
        description: string | null;
        createdAt: string;
      }[];
      yourIp: string;
    }>('/api/admin/admin-ip-restrictions'),
  addAdminIpRule: (cidr: string, listType: 'allowlist' | 'blocklist', description?: string) =>
    request<{
      id: string;
      cidr: string;
      listType: string;
      description: string | null;
      createdAt: string;
    }>('/api/admin/admin-ip-restrictions', {
      method: 'POST',
      body: json({ cidr, listType, description }),
    }),
  removeAdminIpRule: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/admin-ip-restrictions/${id}`, {
      method: 'DELETE',
    }),
  adminNotifications: () =>
    request<{
      entries: {
        id: string;
        action: string;
        actorName: string | null;
        targetName: string | null;
        metadata: unknown;
        createdAt: string;
      }[];
    }>('/api/admin/notifications'),
  adminNotificationCount: (since: string) =>
    request<{ count: number }>(`/api/admin/notifications/unread-count?since=${encodeURIComponent(since)}`),
  logs: (params?: { cursor?: string; action?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.action) qs.set('action', params.action);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const q = qs.toString();
    return request<{
      logs: {
        id: string;
        action: string;
        actorName: string | null;
        targetName: string | null;
        metadata: unknown;
        createdAt: string;
      }[];
      nextCursor: string | null;
    }>(`/api/admin/logs${q ? `?${q}` : ''}`);
  },
  exportLogs: async (params?: { format?: 'csv' | 'jsonl'; action?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams({ format: params?.format ?? 'csv' });
    if (params?.action) qs.set('action', params.action);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const res = await fetch(`/api/admin/logs/export?${qs}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${params?.format === 'jsonl' ? 'jsonl' : 'csv'}`;
    a.click();
    URL.revokeObjectURL(url);
  },
  pruneLogs: (olderThanDays: number) =>
    request<{ ok: boolean; deletedCount: number }>('/api/admin/logs/prune', {
      method: 'DELETE',
      body: json({ olderThanDays }),
    }),
  projects: () =>
    request<
      {
        id: string;
        name: string;
        emoji: string | null;
        description: string | null;
        deadline: string;
        createdAt: string;
        ownerId: string | null;
        teamId: string;
        status: 'active' | 'completed' | 'archived';
        ownerUsername: string | null;
        ownerEmoji: string | null;
        memberCount: number;
        taskCount: number;
        teamMembers: { userId: string; role: string }[];
      }[]
    >('/api/admin/projects'),
  updateProjectStatus: (id: string, status: 'active' | 'completed' | 'archived') =>
    request<{ ok: boolean }>(`/api/admin/products/${id}/status`, {
      method: 'PATCH',
      body: json({ status }),
    }),
  deletedProjects: () =>
    request<
      {
        id: string;
        name: string;
        emoji: string | null;
        deletedAt: string;
        createdAt: string;
        ownerUsername: string | null;
        ownerEmoji: string | null;
        memberCount: number;
        taskCount: number;
      }[]
    >('/api/admin/projects/deleted'),
  restoreProject: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/products/${id}/restore`, {
      method: 'POST',
      body: json({}),
    }),
  hardDeleteProject: (id: string) => request<{ ok: boolean }>(`/api/admin/products/${id}`, { method: 'DELETE' }),
  stats: () =>
    request<{
      userCount: number;
      projectCount: number;
      taskCount: number;
      messageCount: number;
      newUsers: number;
      newProjects: number;
    }>('/api/admin/stats'),
  projectMessages: (productId: string) => request<{ messages: Message[] }>(`/api/admin/products/${productId}/messages`),
  postProjectMessage: (productId: string, content: string, postedAsRole?: string | null) =>
    request<Message>(`/api/admin/products/${productId}/messages`, {
      method: 'POST',
      body: json({ content, postedAsRole }),
    }),
};
