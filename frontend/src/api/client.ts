import type { Product, Task, Team, User, Status, Subtask, KanbanColumn } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
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
  productId: string;
  taskId: string | null;
  authorId: string;
  content: string;
  attachments: { url: string; name: string; type: string }[];
  createdAt: string;
  editedAt: string | null;
  author: { id: string; username: string; avatarEmoji: string | null };
  task?: { id: string; name: string } | null;
}

export interface CanvasSnapshot {
  id: string;
  productId: string;
  userId: string;
  name: string;
  positions: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; zoom: number };
  createdAt: string;
  user: { id: string; username: string; avatarEmoji: string | null };
}

export interface Sprint {
  id: string;
  productId: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  taskIds: string[];
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<User>('/api/auth/login', { method: 'POST', body: json({ email, password }) }),
    logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: json({}) }),
    me: () => request<User>('/api/auth/me'),
  },

  users: {
    list: () => request<User[]>('/api/users'),
    create: (data: { username: string; email: string; password: string; realName?: string; avatarEmoji?: string }) =>
      request<User>('/api/users', { method: 'POST', body: json(data) }),
    get: (id: string) => request<User>(`/api/users/${id}`),
    update: (id: string, data: Partial<Pick<User, 'realName' | 'phone' | 'avatarEmoji' | 'avatarUrl'>>) =>
      request<User>(`/api/users/${id}`, { method: 'PATCH', body: json(data) }),
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
    setMemberRole: (teamId: string, userId: string, role: string) =>
      request<{ ok: boolean }>(`/api/teams/${teamId}/members/${userId}/role`, { method: 'PATCH', body: json({ role }) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/teams/${id}`, { method: 'DELETE' }),
  },

  products: {
    list: () => request<Product[]>('/api/products'),
    create: (data: { name: string; deadline: string; teamId: string; emoji?: string; description?: string }) =>
      request<Product>('/api/products', { method: 'POST', body: json(data) }),
    get: (id: string) => request<Product>(`/api/products/${id}`),
    update: (id: string, data: Partial<Pick<Product, 'name' | 'emoji' | 'description' | 'deadline' | 'ownerId'>>) =>
      request<Product>(`/api/products/${id}`, { method: 'PATCH', body: json(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (productId: string) => request<Task[]>(`/api/products/${productId}/tasks`),
    create: (productId: string, data: { name: string; description?: string; ownerId?: string; color?: string; deadline?: string; canvasX?: number; canvasY?: number }) =>
      request<Task>(`/api/products/${productId}/tasks`, { method: 'POST', body: json(data) }),
    get: (productId: string, taskId: string) => request<Task>(`/api/products/${productId}/tasks/${taskId}`),
    update: (productId: string, taskId: string, data: Partial<Pick<Task, 'name' | 'description' | 'ownerId' | 'color' | 'deadline'> & { status: Status }>) =>
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
    create: (productId: string, data: { name: string; startDate: string; endDate: string; taskIds?: string[] }) =>
      request<Sprint>(`/api/products/${productId}/sprints`, { method: 'POST', body: json(data) }),
    update: (productId: string, sprintId: string, data: { name?: string; startDate?: string; endDate?: string }) =>
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
      .then((r) => r.json() as Promise<{ url: string; name: string; type: string }>);
  },

  permissions: {
    list: (productId: string) =>
      request<{ id: string; userId: string; tab: string; level: string }[]>(`/api/products/${productId}/permissions`),
    put: (productId: string, updates: { userId: string; tab: string; level: string }[]) =>
      request<{ ok: boolean }>(`/api/products/${productId}/permissions`, { method: 'PUT', body: json(updates) }),
  },

  canvasSnapshots: {
    list: (productId: string) =>
      request<CanvasSnapshot[]>(`/api/products/${productId}/canvas-snapshots`),
    create: (productId: string, data: { name: string; positions: Record<string, { x: number; y: number }>; viewport: { x: number; y: number; zoom: number } }) =>
      request<CanvasSnapshot>(`/api/products/${productId}/canvas-snapshots`, { method: 'POST', body: json(data) }),
    delete: (productId: string, snapshotId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/canvas-snapshots/${snapshotId}`, { method: 'DELETE' }),
  },

  seed: {
    examples: () => request<{ ok: boolean; products: string[] }>('/api/seed-examples', { method: 'POST', body: json({}) }),
  },
};
