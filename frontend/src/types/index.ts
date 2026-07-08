export type Status = string;

export interface KanbanColumn {
  id: string;
  productId: string;
  label: string;
  color: string;
  order: number;
  isDone: boolean;
  statusKey: string;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  realName?: string;
  avatarEmoji?: string;
  avatarUrl?: string;
  phone?: string;
  createdAt: string;
  emailVerified?: boolean;
  isAdmin?: boolean;
  isFoundingAdmin?: boolean;
  mustChangePassword?: boolean;
  notificationPreferences?: Record<string, boolean>;
  announcementsEnabled?: boolean;
}

export interface TeamMember {
  userId: string;
  user: Pick<User, 'id' | 'username' | 'realName' | 'avatarEmoji'>;
  role?: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
  members: TeamMember[];
}

export interface Product {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  deadline: string;
  teamId: string;
  ownerId?: string | null;
  analyticsEnabled: boolean;
  createdAt: string;
  team?: Team;
}

export interface Subtask {
  id: string;
  taskId: string;
  name: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  order: number;
}

export interface Task {
  id: string;
  productId: string;
  name: string;
  description?: string;
  status: Status;
  ownerId?: string;
  owner?: Pick<User, 'id' | 'username' | 'realName' | 'avatarEmoji'>;
  reviewerId?: string;
  reviewer?: Pick<User, 'id' | 'username' | 'realName' | 'avatarEmoji'>;
  color?: string;
  deadline?: string;
  kanbanOrder: number;
  canvasX?: number;
  canvasY?: number;
  completedBy?: string;
  completedAt?: string;
  createdBy: string;
  githubUrl?: string;
  createdAt: string;
  subtasks: Subtask[];
  dependsOn: { prerequisiteId: string }[];
  requiredBy: { dependentId: string }[];
}
