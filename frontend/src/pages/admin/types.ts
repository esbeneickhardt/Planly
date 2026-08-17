export type AdminUser = {
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
};

export type AdminProject = {
  id: string;
  name: string;
  emoji: string | null;
  deadline: string;
  createdAt: string;
  status: 'active' | 'completed' | 'archived';
  ownerUsername: string | null;
  ownerEmoji: string | null;
  memberCount: number;
  taskCount: number;
};

export type AdminLogEntry = {
  id: string;
  action: string;
  actorName: string | null;
  targetName: string | null;
  metadata: unknown;
  createdAt: string;
};

export type ServerConfig = {
  adminEmail: string | null;
  requireEmailVerification: boolean;
  requireWhitelist: boolean;
  requireBlocklist: boolean;
  allowProjectCreation: boolean;
  announcementsEnabled: boolean;
  announcementPostRole: string;
  requireMfa: boolean;
};

export type Stats = {
  userCount: number;
  projectCount: number;
  taskCount: number;
  messageCount: number;
  newUsers: number;
  newProjects: number;
};

export type EmailStatus = {
  enabled: boolean;
  from: string | null;
  config: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
  } | null;
};

export type IpRule = {
  id: string;
  cidr: string;
  listType: string;
  description: string | null;
  createdAt: string;
};

export const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'Registered',
  LOGIN: 'Logged in',
  LOGIN_FAILED: 'Login failed',
  USER_PROMOTED: 'Promoted to admin',
  USER_DEMOTED: 'Demoted from admin',
  CROWN_TRANSFERRED: 'Crown transferred',
  FOUNDING_ADMIN_REGISTERED: 'Founding admin registered',
  EMAIL_VERIFIED_BY_ADMIN: 'Email verified by admin',
  USER_DELETED: 'User deleted',
  SERVER_CONFIG_UPDATED: 'Server config updated',
  LOGS_PRUNED: 'Logs pruned',
  LOGIN_LOCKED: 'Account locked',
  LOGIN_UNLOCKED: 'Account unlocked',
  PASSWORD_RESET_BY_ADMIN: 'Password reset by admin',
  PRODUCT_STATUS_CHANGED: 'Project status changed',
};
