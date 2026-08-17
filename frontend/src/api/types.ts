/**
 * Response/request shapes shared across two or more `api/domains/*.ts` files - kept here rather
 * than colocated with a single domain so nothing has to import across domain files just for a type.
 */
import type { User, Status, Task } from '../types';

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
  /** Set only for user-targeted invites created via Settings → Team */
  toUser: { id: string; username: string; avatarEmoji: string | null } | null;
  token: string;
  inviteUrl: string;
  expiresAt: string;
  createdAt: string;
}

export interface PendingInvite {
  id: string;
  token: string;
  teamId: string;
  projectName: string;
  projectEmoji: string | null;
  productId: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface InviteInfo {
  teamId: string;
  teamName: string;
  email: string | null;
  expiresAt: string;
}

export type MinUser = {
  id: string;
  username: string;
  realName: string | null;
  avatarEmoji: string | null;
  isAdmin: boolean;
  isFoundingAdmin: boolean;
};

export type DirectMessage = {
  id: string;
  conversationId: string;
  content: string;
  replyToId: string | null;
  replyTo: { id: string; content: string; author: MinUser } | null;
  createdAt: string;
  editedAt: string | null;
  author: MinUser;
};

export type ConversationSummary = {
  id: string;
  closed: boolean;
  isGroup: boolean;
  name: string | null;
  other: MinUser | null;
  /** All other participants (excluding self) - one entry for a DM, two or more for a group */
  participants: MinUser[];
  lastMessage: DirectMessage | null;
  unread: number;
  updatedAt: string;
};

export interface SearchResults {
  tasks: (Task & { product: { id: string; name: string; emoji: string | null } })[];
  messages: {
    id: string;
    content: string;
    createdAt: string;
    product: { id: string; name: string; emoji: string | null };
    author: MinUser;
    task?: { id: string; name: string } | null;
    /** Set instead of `task` for a DM/group chat result - `other` is null for groups (use
     * `participants` + `groupTitle` for display), populated for a 1:1 DM. */
    conversation?: {
      id: string;
      isGroup: boolean;
      name: string | null;
      other: MinUser | null;
      participants: MinUser[];
    } | null;
  }[];
}

export interface MilestoneResult {
  id: string;
  name: string;
  status: Status;
  deadline: string;
  milestoneOrder: number;
  owner?: Pick<User, 'id' | 'username' | 'realName' | 'avatarEmoji'>;
  totalDependencies: number;
  doneDependencies: number;
  progress: number;
  unassignedDeps: number;
  dependencyList: { id: string; name: string; status: string; ownerId: string | null }[];
}

export interface ColorLegendEntryResult {
  colorKey: string;
  name: string;
  enabled: boolean;
}

export interface MessageAttachment {
  url: string;
  name: string;
  type: string;
  /** Smaller re-encoded variant for inline display - falls back to `url` when absent (older
   * attachments predate thumbnailing, or the file wasn't an image). */
  thumbnailUrl?: string;
}

export interface Message {
  id: string;
  productId: string | null;
  taskId: string | null;
  authorId: string;
  content: string;
  attachments: MessageAttachment[];
  replyToId: string | null;
  replyTo: { id: string; content: string; attachments: MessageAttachment[]; author: MinUser } | null;
  postedAsRole: string | null;
  createdAt: string;
  editedAt: string | null;
  author: MinUser;
  task?: { id: string; name: string } | null;
  reactions: { emoji: string; userId: string }[];
}

export interface CanvasSnapshotViewport {
  x: number;
  y: number;
  zoom: number;
  viewMode?: string;
  simpleMode?: boolean;
  statusFilter?: string | null;
  selectedSprintFilter?: string | null;
  selectedMilestoneIds?: string[];
}

export interface CanvasSnapshot {
  id: string;
  productId: string;
  userId: string;
  name: string;
  positions: Record<string, { x: number; y: number }>;
  viewport: CanvasSnapshotViewport;
  createdAt: string;
  updatedAt: string;
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
  productId: string | null;
  readOnly: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Only present immediately after creation - never retrievable again */
  token?: string;
}

export type AppPermissionLevel = 'write' | 'read' | 'none';
export type AppPermissions = Partial<
  Record<'kanban' | 'backlog' | 'gantt' | 'canvas' | 'messages' | 'analytics', AppPermissionLevel>
>;

export interface AppRegistration {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  productId: string | null;
  permissions: AppPermissions;
  createdAt: string;
}

export type AnnAuthor = {
  id: string;
  username: string;
  realName: string | null;
  avatarEmoji: string | null;
  isAdmin: boolean;
  isFoundingAdmin: boolean;
};
export type AnnTeam = { id: string; name: string } | null;
export type AnnItem = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  commentsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  postedAsRole: string | null;
  author: AnnAuthor | null;
  team: AnnTeam;
  _count: { comments: number };
};
export type AnnComment = {
  id: string;
  announcementId: string;
  content: string;
  postedAsRole: string | null;
  createdAt: string;
  editedAt: string | null;
  author: AnnAuthor | null;
};
