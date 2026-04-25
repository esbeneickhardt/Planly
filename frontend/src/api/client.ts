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
    update: (id: string, data: Partial<Pick<User, 'realName' | 'phone' | 'avatarEmoji'>>) =>
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
    delete: (id: string) => request<{ ok: boolean }>(`/api/teams/${id}`, { method: 'DELETE' }),
  },

  products: {
    list: () => request<Product[]>('/api/products'),
    create: (data: { name: string; deadline: string; teamId: string; emoji?: string; description?: string }) =>
      request<Product>('/api/products', { method: 'POST', body: json(data) }),
    get: (id: string) => request<Product>(`/api/products/${id}`),
    update: (id: string, data: Partial<Pick<Product, 'name' | 'emoji' | 'description' | 'deadline'>>) =>
      request<Product>(`/api/products/${id}`, { method: 'PATCH', body: json(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (productId: string) => request<Task[]>(`/api/products/${productId}/tasks`),
    create: (productId: string, data: { name: string; description?: string; ownerId?: string; color?: string; deadline?: string }) =>
      request<Task>(`/api/products/${productId}/tasks`, { method: 'POST', body: json(data) }),
    get: (productId: string, taskId: string) => request<Task>(`/api/products/${productId}/tasks/${taskId}`),
    update: (productId: string, taskId: string, data: Partial<Pick<Task, 'name' | 'description' | 'ownerId' | 'color' | 'deadline'> & { status: Status }>) =>
      request<Task>(`/api/products/${productId}/tasks/${taskId}`, { method: 'PATCH', body: json(data) }),
    delete: (productId: string, taskId: string) =>
      request<{ ok: boolean }>(`/api/products/${productId}/tasks/${taskId}`, { method: 'DELETE' }),
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

  seed: {
    examples: () => request<{ ok: boolean; products: string[] }>('/api/seed-examples', { method: 'POST', body: json({}) }),
  },
};
