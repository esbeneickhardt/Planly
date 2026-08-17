/**
 * Public API surface - re-exports every domain from `api/domains/` as the same `api.*` object
 * every call site already imports, plus every response/request type from `types.ts`. Domain logic
 * lives in `api/domains/<name>.ts`; this file is deliberately just wiring so it never needs to grow.
 *
 * Add a new endpoint in the domain file it belongs to (or a new domain file, added to both the
 * import list and the `api` object below) - never inline a new endpoint directly here.
 */
export * from './types';
export { displayName } from '../utils/user';

import { users } from './domains/users';
import { teams } from './domains/teams';
import { products } from './domains/products';
import { tasks } from './domains/tasks';
import { subtasks } from './domains/subtasks';
import { columns } from './domains/columns';
import { milestones } from './domains/milestones';
import { connections } from './domains/connections';
import { colorLegend } from './domains/colorLegend';
import { sprints } from './domains/sprints';
import { messages } from './domains/messages';
import { adminChat } from './domains/adminChat';
import { accessRequests } from './domains/accessRequests';
import { upload, deleteUpload } from './domains/upload';
import { permissions } from './domains/permissions';
import { canvasSnapshots } from './domains/canvasSnapshots';
import { seed } from './domains/seed';
import { notifications } from './domains/notifications';
import { webhooks } from './domains/webhooks';
import { invites } from './domains/invites';
import { auth } from './domains/auth';
import { exportApi } from './domains/exportApi';
import { search } from './domains/search';
import { apiTokens } from './domains/apiTokens';
import { appRegistrations } from './domains/appRegistrations';
import { emailStatus, emailConfig } from './domains/email';
import { publicConfig } from './domains/publicConfig';
import { me } from './domains/me';
import { admin } from './domains/admin';
import { announcements } from './domains/announcements';
import { calendar } from './domains/calendar';
import { analytics } from './domains/analytics';
import { conversations } from './domains/conversations';
import { github } from './domains/github';

export const api = {
  users,
  teams,
  products,
  tasks,
  subtasks,
  columns,
  milestones,
  connections,
  colorLegend,
  sprints,
  messages,
  adminChat,
  accessRequests,
  upload,
  deleteUpload,
  permissions,
  canvasSnapshots,
  seed,
  notifications,
  webhooks,
  invites,
  auth,
  export: exportApi,
  search,
  apiTokens,
  appRegistrations,
  emailStatus,
  emailConfig,
  publicConfig,
  me,
  admin,
  announcements,
  calendar,
  analytics,
  conversations,
  github,
};
