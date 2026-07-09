/**
 * Typed API client — thin wrapper around fetch() with CSRF token injection,
 * error handling, and typed response interfaces for all backend endpoints.
 *
 * The request() helper:
 *   - Sends cookies with every request (credentials: 'include')
 *   - Reads the non-httpOnly `csrf` cookie and adds it as X-CSRF-Token on
 *     all mutating methods (POST, PUT, PATCH, DELETE)
 *   - Parses error responses and throws a typed ApiError with the status code
 *   - Dispatches a 'planly:email-not-verified' custom event on 403 so the UI
 *     can prompt the user to verify their email without coupling every caller
 *
 * All exported functions above the helpers call request() directly —
 * add new ones in the same pattern to keep the client consistent.
 */
import type { Product, Task, Team, User, Status, Subtask, KanbanColumn } from '../types';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  productId: string | null;
  taskId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface Webhook {
  id: string;
  productId: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  /** Only present at creation */
  secret?: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  responseBody: string | null;
  createdAt: string;
}

export interface TeamInvite {
  id: string;
  email: string | null;
  inviteUrl: string;
  expiresAt: string;
  createdAt: string;
}

export interface InviteInfo {
  teamId: string;
  teamName: string;
  email: string | null;
  expiresAt: string;
}

export type MinUser = { id: string; username: string; realName: string | null; avatarEmoji: string | null };
export { displayName } from '../utils/user';

export interface SearchResults {
  tasks: (Task & { product: { id: string; name: string; emoji: string | null } })[];
  messages: {
    id: string; content: string; createdAt: string;
    product: { id: string; name: string; emoji: string | null };
    author: MinUser;
    task?: { id: string; name: string } | null;
  }[];
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getCsrfToken(): string | undefined {
  return document.cookie.split('; ').find((c) => c.startsWith('csrf='))?.split('=')[1];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrfHeaders: Record<string, string> = {};
  if (MUTATING.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) csrfHeaders['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...csrfHeaders, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 403 && (body as { code?: string }).code === 'EMAIL_NOT_VERIFIED') {
      window.dispatchEvent(new CustomEvent('planly:email-not-verified'));
    }
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export interface MilestoneResult {
  id: string; name: string; status: Status; deadline: string;
  owner?: Pick<User, 'id' | 'username' | 'avatarEmoji'>;
  totalDependencies: number; doneDependencies: number; progress: number; unassignedDeps: number;
  dependencyList: { id: string; name: string; status: string; ownerId: string | null }[];
}

export interface ColorLegendEntryResult {
  colorKey: string;
  name: string;
  enabled: boolean;
}

export interface Message {
  id: string;
  productId: string | null;
  taskId: string | null;
  authorId: string;
  content: string;
  attachments: { url: string; name: string; type: string }[];
  createdAt: string;
  editedAt: string | null;
  author: MinUser;
  task?: { id: string; name: string } | null;
  reactions: { emoji: string; userId: string }[];
}

export interface CanvasSnapshot {
  id: string;
  productId: string;
  userId: string;
  name: string;
  positions: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; zoom: number; viewMode?: string; simpleMode?: boolean };
  createdAt: string;
  user: MinUser;
}

export interface Sprint {
  id: string;
  productId: string;
  name: string;
  color: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  taskIds: string[];
}

export interface ApiToken {
  id: string;
  name: string;
  appId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Only present immediately after creation - never retrievable again */
  token?: string;
}

export interface AppRegistration {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
}

export type AnnAuthor = { id: string; username: string; realName: string | null; avatarEmoji: string | null; isAdmin: boolean };
export type AnnTeam   = { id: string; name: string } | null;
export type AnnItem   = {
  id: string; title: string; content: string; pinned: boolean;
  commentsEnabled: boolean; createdAt: string; updatedAt: string;
  author: AnnAuthor; team: AnnTeam;
  _count: { comments: number };
};
export type AnnComment = {
  id: string; announcementId: string; content: string;
  createdAt: string; editedAt: string | null; author: AnnAuthor;
};

export const api = {

  users: {
    list: () => request<Pick<User, 'id' | 'username' | 'realName' | 'avatarEmoji'>[]>('/api/users'),
    create: (data: { username: string; email: string; password: string; realName?: string; avatarEmoji?: string; tosAccepted: true }) =>
      request<User>('/api/users', { method: 'POST', body: json(data) }),
    get: (id: string) => request<User>(`/api/users/${id}`),
    update: (id: string, data: Partial<Pick<User, 'realName' | 'phone' | 'avatarEmoji' | 'avatarUrl'>>) =>
      request<User>(`/api/users/${id}`, { method: 'PATCH', body: json(data) }),
    updateNotificationPreferences: (id: string, preferences: Record<string, boolean>) =>
      request<{ notificationPreferences: Record<string, boolean> }>(`/api/users/${id}/notification-preferences`, { method: 'PATCH', body: json({ preferences }) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
  },

  teams: {
    list: () => request<Team[]>('/api/teams'),
    create: (data: { name: string; memberIds?: string[] }) =>
      request<Team>('/api/teams', { method: 'POST', body: json(data) }),
    get: (id: string) => request<Team>(`/api/teams/${id}`),
    update: (id: string, data: { name?: string }) =>
      request<Team>(`/api/teams/${id}`, { method: 'PATCH', body: json(data) }),
    addMember: (id: string, userId: string) =>
      request<{ ok: boolean }>(`/api/teams/${id}/members`, { method: 'POST', body: json({ userId }) }),
    removeMember: (id: string, userId: string) =>
      request<{ ok: boolean }>(`/api/teams/${id}/members/${userId}`, { method: 'DELETE' }),
    setMemberRole: (teamId: string, userId: string, role: 'member' | 'co_owner') =>
      request<{ ok: boolean }>(`/api/teams/${teamId}/members/${userId}/role`, { method: 'PATCH', body: json({ role }) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/teams/${id}`, { method: 'DELETE' }),
  },

  products: {
    list: () => request<Product[]>('/api/products'),
    create: (data: { name: string; deadline: string; teamId: string; emoji?: string; description?: string }) =>
      request<Product>('/api/products', { method: 'POST', body: json(data) }),
    get: (id: string) => request<Product>(`/api/products/${id}`),
    update: (id: string, data: Partial<Pick<Product, 'name' | 'emoji' | 'description' | 'deadline' | 'ownerId' | 'analyticsEnabled'>>) =>
      request<Product>(`/api/products/${id}`, { method: 'PATCH', body: json(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (productId: string) => request<Task[]>(`/api/products/${productId}/tasks`),
    create: (productId: string, data: { name: string; description?: string; ownerId?: string; color?: string; deadline?: string; canvasX?: number; canvasY?: number; status?: string }) =>
      request<Task>(`/api/products/${productId}/tasks`, { method: 'POST', body: json(data) }),
    get: (productId: string, taskId: string) => request<Task>(`/api/products/${productId}/tasks/${taskId}`),
    update: (productId: string, taskId: string, data: Partial<Pick<Task, 'name' | 'description' | 'ownerId' | 'color' | 'deadline'> & { status: Status; reviewerId: string | null }>) =>
      request<Task>(`/api/products/${productId}/tasks/${taskId}`, { method: 'PATCH', body: json(data) }),
    delete: (productId: string, taskId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/tasks/${taskId}`, { method: 'DELETE' }),
    reorder: (productId: string, updates: { taskId: string; order: number }[]) =>
      request<{ ok: boolean }>(`/api/products/${productId}/tasks/reorder`, { method: 'PATCH', body: json({ updates }) }),
  },

  subtasks: {
    create: (productId: string, taskId: string, name: string) =>
      request<Subtask>(`/api/products/${productId}/tasks/${taskId}/subtasks`, { method: 'POST', body: json({ name }) }),
    update: (productId: string, taskId: string, subtaskId: string, data: Partial<Pick<Subtask, 'name' | 'completed' | 'order'>>) =>
      request<Subtask>(`/api/products/${productId}/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'PATCH', body: json(data) }),
    delete: (productId: string, taskId: string, subtaskId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' }),
  },

  columns: {
    list: (productId: string) =>
      request<KanbanColumn[]>(`/api/products/${productId}/columns`),
    create: (productId: string, data: { label: string; color?: string }) =>
      request<KanbanColumn>(`/api/products/${productId}/columns`, { method: 'POST', body: json(data) }),
    update: (productId: string, columnId: string, data: { label?: string; color?: string }) =>
      request<KanbanColumn>(`/api/products/${productId}/columns/${columnId}`, { method: 'PATCH', body: json(data) }),
    delete: (productId: string, columnId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/columns/${columnId}`, { method: 'DELETE' }),
    reorder: (productId: string, order: { id: string; order: number }[]) =>
      request<{ ok: boolean }>(`/api/products/${productId}/columns/reorder`, { method: 'PATCH', body: json({ order }) }),
  },

  milestones: {
    list: (productId: string) =>
      request<{ milestones: MilestoneResult[]; product: Product }>(`/api/products/${productId}/milestones`),
  },

  connections: {
    list: (productId: string) =>
      request<string[]>(`/api/products/${productId}/connections`),
    add: (productId: string, taskId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/connections`, { method: 'POST', body: json({ taskId }) }),
    remove: (productId: string, taskId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/connections/${taskId}`, { method: 'DELETE' }),
  },

  colorLegend: {
    list: (productId: string) =>
      request<ColorLegendEntryResult[]>(`/api/products/${productId}/color-legend`),
    update: (productId: string, entries: ColorLegendEntryResult[]) =>
      request<{ ok: boolean }>(`/api/products/${productId}/color-legend`, { method: 'PUT', body: json(entries) }),
  },

  sprints: {
    list: (productId: string) =>
      request<Sprint[]>(`/api/products/${productId}/sprints`),
    create: (productId: string, data: { name: string; startDate: string; endDate: string; color?: string; taskIds?: string[] }) =>
      request<Sprint>(`/api/products/${productId}/sprints`, { method: 'POST', body: json(data) }),
    update: (productId: string, sprintId: string, data: { name?: string; startDate?: string; endDate?: string; color?: string }) =>
      request<Sprint>(`/api/products/${productId}/sprints/${sprintId}`, { method: 'PATCH', body: json(data) }),
    delete: (productId: string, sprintId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/sprints/${sprintId}`, { method: 'DELETE' }),
    addTasks: (productId: string, sprintId: string, taskIds: string[]) =>
      request<{ ok: boolean; added: number }>(`/api/products/${productId}/sprints/${sprintId}/tasks`, { method: 'POST', body: json({ taskIds }) }),
    removeTask: (productId: string, sprintId: string, taskId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/sprints/${sprintId}/tasks/${taskId}`, { method: 'DELETE' }),
  },

  messages: {
    list: (productId: string, taskId?: string) =>
      request<Message[]>(`/api/products/${productId}/messages${taskId ? `?taskId=${taskId}` : ''}`),
    listAll: (productId: string) =>
      request<Message[]>(`/api/products/${productId}/messages?all=true`),
    create: (productId: string, data: { content: string; taskId?: string; attachments?: { url: string; name: string; type: string }[] }) =>
      request<Message>(`/api/products/${productId}/messages`, { method: 'POST', body: json(data) }),
    update: (productId: string, messageId: string, content: string) =>
      request<Message>(`/api/products/${productId}/messages/${messageId}`, { method: 'PATCH', body: json({ content }) }),
    delete: (productId: string, messageId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/messages/${messageId}`, { method: 'DELETE' }),
    toggleReaction: (productId: string, messageId: string, emoji: string) =>
      request<{ reactions: { emoji: string; userId: string }[] }>(`/api/products/${productId}/messages/${messageId}/reactions`, { method: 'POST', body: json({ emoji }) }),
  },

  adminChat: {
    list: (cursor?: string) =>
      request<Message[]>(`/api/admin/chat${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
    create: (data: { content: string; attachments?: { url: string; name: string; type: string }[] }) =>
      request<Message>('/api/admin/chat', { method: 'POST', body: json(data) }),
    update: (messageId: string, content: string) =>
      request<Message>(`/api/admin/chat/${messageId}`, { method: 'PATCH', body: json({ content }) }),
    delete: (messageId: string) =>
      request<{ ok: boolean }>(`/api/admin/chat/${messageId}`, { method: 'DELETE' }),
    toggleReaction: (messageId: string, emoji: string) =>
      request<{ reactions: { emoji: string; userId: string }[] }>(`/api/admin/chat/${messageId}/reactions`, { method: 'POST', body: json({ emoji }) }),
  },

  accessRequests: {
    list: (productId: string) =>
      request<{ id: string; userId: string; status: string; note: string | null; createdAt: string; user: { id: string; username: string; avatarEmoji: string | null; realName: string | null } }[]>(
        `/api/products/${productId}/access-requests`
      ),
    request: (productId: string, note?: string) =>
      request<{ id: string; status: string }>(`/api/products/${productId}/access-requests`, { method: 'POST', body: json({ note }) }),
    decide: (productId: string, requestId: string, action: 'approve' | 'reject') =>
      request<{ ok: boolean }>(`/api/products/${productId}/access-requests/${requestId}`, { method: 'PATCH', body: json({ action }) }),
    discover: () =>
      request<(Product & { requestStatus: string | null })[]>('/api/products/discover'),
  },

  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/upload', { method: 'POST', credentials: 'include', body: form })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ url: string; name: string; type: string }>;
      });
  },

  deleteUpload: (filename: string) =>
    request<{ ok: boolean }>(`/api/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' }),

  permissions: {
    list: (productId: string) =>
      request<{ id: string; userId: string; tab: string; level: string }[]>(`/api/products/${productId}/permissions`),
    put: (productId: string, updates: { userId: string; tab: string; level: string }[]) =>
      request<{ ok: boolean }>(`/api/products/${productId}/permissions`, { method: 'PUT', body: json(updates) }),
  },

  canvasSnapshots: {
    list: (productId: string) =>
      request<CanvasSnapshot[]>(`/api/products/${productId}/canvas-snapshots`),
    create: (productId: string, data: { name: string; positions: Record<string, { x: number; y: number }>; viewport: { x: number; y: number; zoom: number; viewMode?: string; simpleMode?: boolean } }) =>
      request<CanvasSnapshot>(`/api/products/${productId}/canvas-snapshots`, { method: 'POST', body: json(data) }),
    delete: (productId: string, snapshotId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/canvas-snapshots/${snapshotId}`, { method: 'DELETE' }),
  },

  seed: {
    examples: () => request<{ ok: boolean; products: string[] }>('/api/seed-examples', { method: 'POST', body: json({}) }),
  },

  notifications: {
    list: (cursor?: string, productId?: string) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (productId) params.set('productId', productId);
      const qs = params.toString();
      return request<{ notifications: Notification[]; nextCursor: string | null }>(`/api/notifications${qs ? `?${qs}` : ''}`);
    },
    unreadCount: (productId?: string) =>
      request<{ count: number }>(`/api/notifications/unread-count${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`),
    markRead: (ids: string[]) => request<{ ok: boolean }>('/api/notifications/read', { method: 'PATCH', body: json({ ids }) }),
    markAllRead: () => request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST', body: json({}) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/notifications/${id}`, { method: 'DELETE' }),
    clearAll: () => request<{ ok: boolean }>('/api/notifications', { method: 'DELETE' }),
  },

  webhooks: {
    list: (productId: string) => request<Webhook[]>(`/api/products/${productId}/webhooks`),
    create: (productId: string, data: { url: string; events: string[] }) =>
      request<Webhook & { secret: string }>(`/api/products/${productId}/webhooks`, { method: 'POST', body: json(data) }),
    update: (productId: string, webhookId: string, data: { url?: string; events?: string[]; active?: boolean }) =>
      request<Webhook>(`/api/products/${productId}/webhooks/${webhookId}`, { method: 'PATCH', body: json(data) }),
    delete: (productId: string, webhookId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/webhooks/${webhookId}`, { method: 'DELETE' }),
    rotateSecret: (productId: string, webhookId: string) =>
      request<{ secret: string }>(`/api/products/${productId}/webhooks/${webhookId}/rotate-secret`, { method: 'POST', body: json({}) }),
    deliveries: (productId: string, webhookId: string) =>
      request<WebhookDelivery[]>(`/api/products/${productId}/webhooks/${webhookId}/deliveries`),
  },

  invites: {
    list: (teamId: string) => request<TeamInvite[]>(`/api/teams/${teamId}/invites`),
    create: (teamId: string, email?: string) =>
      request<TeamInvite>(`/api/teams/${teamId}/invites`, { method: 'POST', body: json({ email }) }),
    revoke: (teamId: string, inviteId: string) =>
      request<{ ok: boolean }>(`/api/teams/${teamId}/invites/${inviteId}`, { method: 'DELETE' }),
    getInfo: (token: string) => request<InviteInfo>(`/api/invites/${token}`),
    accept: (token: string) => request<{ ok: boolean; teamId: string; teamName: string }>(`/api/invites/${token}/accept`, { method: 'POST', body: json({}) }),
  },

  auth: {
    login: (identifier: string, password: string) =>
      request<User | { requiresTOTP: true; mfaToken: string }>('/api/auth/login', { method: 'POST', body: json({ identifier, password }) }),
    logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: json({}) }),
    me: () => request<User>('/api/auth/me'),
    emailEnabled: () =>
      request<{ enabled: boolean }>('/api/auth/email-enabled'),
    forgotPassword: (email: string) =>
      request<{ ok: boolean }>('/api/auth/forgot-password', { method: 'POST', body: json({ email }) }),
    resetPassword: (token: string, password: string) =>
      request<{ ok: boolean }>('/api/auth/reset-password', { method: 'POST', body: json({ token, password }) }),
    sendVerification: () =>
      request<{ ok: boolean }>('/api/auth/send-verification', { method: 'POST', body: json({}) }),
    resendVerification: (email: string) =>
      request<{ ok: boolean }>('/api/auth/resend-verification', { method: 'POST', body: json({ email }) }),
    verifyEmail: (token: string) =>
      request<{ ok: boolean }>('/api/auth/verify-email', { method: 'POST', body: json({ token }) }),
    ssoConfig: () => request<{ enabled: boolean; providerName: string }>('/api/auth/sso/config'),
    changePassword: (data: { currentPassword?: string; newPassword: string }) =>
      request<{ ok: boolean }>('/api/auth/change-password', { method: 'POST', body: json(data) }),
    totpStatus: () =>
      request<{ totpEnabled: boolean }>('/api/auth/totp/status'),
    totpSetup: () =>
      request<{ qrDataUrl: string; secret: string; uri: string }>('/api/auth/totp/setup', { method: 'POST', body: json({}) }),
    totpConfirm: (code: string) =>
      request<{ ok: boolean; backupCodes: string[]; message: string }>('/api/auth/totp/confirm', { method: 'POST', body: json({ code }) }),
    totpDisable: (code: string) =>
      request<{ ok: boolean }>('/api/auth/totp/disable', { method: 'DELETE', body: json({ code }) }),
    totpChallenge: (mfaToken: string, code: string) =>
      request<User>('/api/auth/totp/challenge', { method: 'POST', body: json({ mfaToken, code }) }),
  },

  export: {
    product: (productId: string) => `/api/products/${productId}/export`,
  },

  search: (q: string, productId?: string) =>
    request<SearchResults>(`/api/search?q=${encodeURIComponent(q)}${productId ? `&productId=${productId}` : ''}`),

  apiTokens: {
    list: () => request<ApiToken[]>('/api/auth/tokens'),
    create: (data: { name: string; expiresAt?: string }) =>
      request<ApiToken & { token: string }>('/api/auth/tokens', { method: 'POST', body: json(data) }),
    delete: (tokenId: string) =>
      request<{ ok: boolean }>(`/api/auth/tokens/${tokenId}`, { method: 'DELETE' }),
  },

  appRegistrations: {
    list: () => request<AppRegistration[]>('/api/apps'),
    create: (data: { name: string; description?: string }) =>
      request<AppRegistration>('/api/apps', { method: 'POST', body: json(data) }),
    update: (appId: string, data: { name?: string; description?: string }) =>
      request<AppRegistration>(`/api/apps/${appId}`, { method: 'PATCH', body: json(data) }),
    delete: (appId: string) =>
      request<{ ok: boolean }>(`/api/apps/${appId}`, { method: 'DELETE' }),
    listTokens: (appId: string) =>
      request<ApiToken[]>(`/api/apps/${appId}/tokens`),
    createToken: (appId: string, data: { name: string; expiresAt?: string }) =>
      request<ApiToken & { token: string }>(`/api/apps/${appId}/tokens`, { method: 'POST', body: json(data) }),
    deleteToken: (appId: string, tokenId: string) =>
      request<{ ok: boolean }>(`/api/apps/${appId}/tokens/${tokenId}`, { method: 'DELETE' }),
  },

  emailStatus: {
    get: () => request<{ enabled: boolean; from: string | null; config: { host: string; port: number; secure: boolean; user: string; from: string } | null }>('/api/email-status'),
    test: () => request<{ ok: boolean }>('/api/email-status/test', { method: 'POST', body: json({}) }),
  },

  emailConfig: {
    get: () => request<{ host: string; port: number; secure: boolean; user: string; from: string } | null>('/api/email-config'),
    save: (data: { host: string; port: number; secure: boolean; user: string; pass?: string; from: string }) =>
      request<{ ok: boolean }>('/api/email-config', { method: 'PUT', body: json(data) }),
    clear: () => request<{ ok: boolean }>('/api/email-config', { method: 'DELETE' }),
  },

  me: {
    permissions: () => request<Array<{
      productId: string;
      productName: string;
      productEmoji: string | null;
      role: string;
      permissions: Record<string, string>;
    }>>('/api/me/permissions'),
  },

  admin: {
    users: () => request<{ id: string; username: string; email: string; isAdmin: boolean; isFoundingAdmin: boolean; emailVerified: boolean; createdAt: string; failedLoginAttempts: number; loginLockedUntil: string | null }[]>('/api/admin/users'),
    promote: (userId: string) => request<{ ok: boolean }>(`/api/admin/users/${userId}/promote`, { method: 'PUT', body: json({}) }),
    demote: (userId: string) => request<{ ok: boolean }>(`/api/admin/users/${userId}/demote`, { method: 'PUT', body: json({}) }),
    transferCrown: (userId: string) => request<{ ok: boolean }>('/api/admin/transfer-crown', { method: 'PUT', body: json({ userId }) }),
    verifyEmail: (userId: string) => request<{ ok: boolean }>(`/api/admin/users/${userId}/verify-email`, { method: 'PUT', body: json({}) }),
    deleteUser: (userId: string) => request<{ ok: boolean }>(`/api/admin/users/${userId}`, { method: 'DELETE' }),
    unlock: (userId: string) => request<{ ok: boolean }>(`/api/admin/users/${userId}/unlock`, { method: 'PUT', body: json({}) }),
    whitelist: () => request<{ id: string; pattern: string; createdAt: string }[]>('/api/admin/whitelist'),
    addWhitelist: (pattern: string) => request<{ id: string; pattern: string; createdAt: string }>('/api/admin/whitelist', { method: 'POST', body: json({ pattern }) }),
    removeWhitelist: (id: string) => request<{ ok: boolean }>(`/api/admin/whitelist/${id}`, { method: 'DELETE' }),
    serverConfig: () => request<{ adminEmail: string | null; requireEmailVerification: boolean; requireWhitelist: boolean; allowProjectCreation: boolean; announcementsEnabled: boolean; announcementPostRole: string; ipRestrictionMode: string }>('/api/admin/server-config'),
    updateServerConfig: (data: { requireEmailVerification?: boolean; requireWhitelist?: boolean; allowProjectCreation?: boolean; announcementsEnabled?: boolean; announcementPostRole?: string }) =>
      request<{ ok: boolean; verificationEmailsSent?: number }>('/api/admin/server-config', { method: 'PUT', body: json(data) }),
    ipRestrictions: () => request<{ mode: string; rules: { id: string; cidr: string; description: string | null; createdAt: string }[]; yourIp: string }>('/api/admin/ip-restrictions'),
    setIpMode: (mode: string) => request<{ ok: boolean }>('/api/admin/ip-restrictions/mode', { method: 'PUT', body: json({ mode }) }),
    addIpRule: (cidr: string, description?: string) => request<{ id: string; cidr: string; description: string | null; createdAt: string }>('/api/admin/ip-restrictions', { method: 'POST', body: json({ cidr, description }) }),
    removeIpRule: (id: string) => request<{ ok: boolean }>(`/api/admin/ip-restrictions/${id}`, { method: 'DELETE' }),
    adminNotifications: () => request<{ entries: { id: string; action: string; actorName: string | null; targetName: string | null; metadata: unknown; createdAt: string }[] }>('/api/admin/notifications'),
    adminNotificationCount: (since: string) => request<{ count: number }>(`/api/admin/notifications/unread-count?since=${encodeURIComponent(since)}`),
    logs: (params?: { cursor?: string; action?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams();
      if (params?.cursor) qs.set('cursor', params.cursor);
      if (params?.action) qs.set('action', params.action);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      const q = qs.toString();
      return request<{ logs: { id: string; action: string; actorName: string | null; targetName: string | null; metadata: unknown; createdAt: string }[]; nextCursor: string | null }>(`/api/admin/logs${q ? `?${q}` : ''}`);
    },
    exportLogs: async (params?: { format?: 'csv' | 'jsonl'; action?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams({ format: params?.format ?? 'csv' });
      if (params?.action) qs.set('action', params.action);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      const res = await fetch(`/api/admin/logs/export?${qs}`, { credentials: 'include' });
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
      request<{ ok: boolean; deletedCount: number }>('/api/admin/logs/prune', { method: 'DELETE', body: json({ olderThanDays }) }),
    projects: () => request<{ id: string; name: string; emoji: string | null; deadline: string; createdAt: string; ownerUsername: string | null; ownerEmoji: string | null; memberCount: number; taskCount: number }[]>('/api/admin/projects'),
    stats: () => request<{ userCount: number; projectCount: number; taskCount: number; messageCount: number; newUsers: number; newProjects: number }>('/api/admin/stats'),
  },

  announcements: {
    list: () => request<{
      announcements: AnnItem[];
      canPost: boolean;
      enabled: boolean;
    }>('/api/announcements'),
    create: (data: { title: string; content: string; pinned?: boolean; teamId?: string; commentsEnabled?: boolean }) =>
      request<AnnItem>('/api/announcements', { method: 'POST', body: json(data) }),
    update: (id: string, data: { title?: string; content?: string; pinned?: boolean; commentsEnabled?: boolean }) =>
      request<AnnItem>(`/api/announcements/${id}`, { method: 'PATCH', body: json(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/announcements/${id}`, { method: 'DELETE' }),
    comments: {
      list: (annId: string) => request<AnnComment[]>(`/api/announcements/${annId}/comments`),
      create: (annId: string, content: string) =>
        request<AnnComment>(`/api/announcements/${annId}/comments`, { method: 'POST', body: json({ content }) }),
      delete: (annId: string, commentId: string) =>
        request<{ ok: boolean }>(`/api/announcements/${annId}/comments/${commentId}`, { method: 'DELETE' }),
    },
  },

  calendar: {
    getTokenStatus: (productId: string) =>
      request<{ hasToken: boolean; createdAt: string | null }>(`/api/products/${productId}/calendar/token`),
    generateToken: (productId: string) =>
      request<{ token: string }>(`/api/products/${productId}/calendar/token`, { method: 'POST', body: json({}) }),
    revokeToken: (productId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/calendar/token`, { method: 'DELETE' }),
    feedUrl: (productId: string, token: string) =>
      `${window.location.origin}/api/products/${productId}/calendar.ics?token=${encodeURIComponent(token)}`,
  },

  analytics: {
    get: (productId: string) => request<{
      tasksByDay: { date: string; count: number }[];
      cycleTimeAvgDays: number | null;
      totalCompleted: number;
      totalActive: number;
      statusBreakdown: { status: string; count: number }[];
      sprintVelocity: { sprintId: string; name: string; startDate: string; endDate: string; color: string; completed: number }[];
    }>(`/api/products/${productId}/analytics`),
    activity: (productId: string, cursor?: string) => request<{
      events: { id: string; actorId: string; action: string; entityType: string; entityId: string | null; entityName: string | null; metadata: unknown; createdAt: string }[];
      nextCursor: string | null;
    }>(`/api/products/${productId}/activity${cursor ? `?cursor=${cursor}` : ''}`),
    workload: (productId: string) => request<{
      statusBreakdown: { status: string; count: number }[];
      totalActive: number;
      totalCompleted: number;
      completionsByDay: { date: string; count: number }[];
    }>(`/api/products/${productId}/analytics/workload`),
  },
  github: {
    getConfig: () => request<{
      webhookUrl: string;
      hasSecret: boolean;
      githubImportIssues: boolean;
      githubImportPrs: boolean;
      githubDefaultProductId: string | null;
    }>('/api/github/config'),
    updateConfig: (data: { githubImportIssues?: boolean; githubImportPrs?: boolean; githubDefaultProductId?: string | null }) =>
      request<{ ok: boolean }>('/api/github/config', { method: 'POST', body: json(data) }),
    regenerateSecret: () => request<{ secret: string }>('/api/github/regenerate-secret', { method: 'POST', body: json({}) }),
  },
};
