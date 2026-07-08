# 21 — Complete API Endpoint Checklist

← [Back to index](README.md)

Every route exposed by the backend, grouped by resource. For each endpoint, verify:
1. **Happy path** — correct input, correct auth → expected 2xx
2. **Auth** — no cookie/token → 401
3. **Authorization** — wrong role/scope → 403
4. **Validation** — malformed input → 400 (not 500)

Use `TOKEN` for a PAT (unscoped, admin user) and `ALICE_TOKEN` for Alice's PAT.
Use `PRODUCT_ID` for Alpha Project.

---

## System

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/health` | ☐ | No auth; returns `{"ok":true}` |
| GET | `/api/health/ready` | ☐ | No auth; 200 = DB connected |
| GET | `/api/metrics` | ☐ | Requires `X-Metrics-Secret` if set |
| POST | `/api/seed-examples` | ☐ | Check if guarded/disabled in production |

---

## Authentication

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| POST | `/api/users` | ☐ | Register new user; 201 on success |
| POST | `/api/auth/login` | ☐ | Sets cookies; 200 or 429 if locked |
| POST | `/api/auth/logout` | ☐ | Clears cookies; requires auth + CSRF |
| GET | `/api/auth/me` | ☐ | Returns current user; 401 if no session |
| GET | `/api/auth/refresh` | ☐ | Re-issues token cookie |
| POST | `/api/auth/change-password` | ☐ | Requires current password |
| POST | `/api/auth/forgot-password` | ☐ | No auth; always 200 |
| POST | `/api/auth/reset-password` | ☐ | Token from email |
| POST | `/api/auth/verify-email` | ☐ | Token from email |
| POST | `/api/auth/resend-verification` | ☐ | Resend verification email |
| POST | `/api/auth/send-verification` | ☐ | Requires auth (self-serve) |
| GET | `/api/auth/email-enabled` | ☐ | No auth; returns `{"enabled":bool}` |
| GET | `/api/auth/totp/status` | ☐ | Auth required |
| POST | `/api/auth/totp/setup` | ☐ | Auth required; returns QR URL |
| POST | `/api/auth/totp/confirm` | ☐ | Auth required; 6-digit code |
| DELETE | `/api/auth/totp/disable` | ☐ | Auth required; code required |
| POST | `/api/auth/totp/challenge` | ☐ | Challenge token + 6-digit code |
| GET | `/api/auth/sso/config` | ☐ | No auth; returns SSO enabled/provider |
| GET | `/api/auth/sso/authorize` | ☐ | No auth; redirect to provider |
| GET | `/api/auth/sso/callback` | ☐ | Handled by provider redirect |

---

## API Tokens (PATs)

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/auth/tokens` | ☐ | List own PATs (no raw values) |
| POST | `/api/auth/tokens` | ☐ | Create PAT; raw token shown once |
| DELETE | `/api/auth/tokens/:tokenId` | ☐ | Revoke PAT |

---

## App Registrations

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/apps` | ☐ | List own registrations |
| POST | `/api/apps` | ☐ | Create registration |
| PATCH | `/api/apps/:appId` | ☐ | Update name/description |
| DELETE | `/api/apps/:appId` | ☐ | Delete + invalidate all tokens |
| GET | `/api/apps/:appId/tokens` | ☐ | List tokens (no raw values) |
| POST | `/api/apps/:appId/tokens` | ☐ | Issue new token; raw shown once |
| DELETE | `/api/apps/:appId/tokens/:tokenId` | ☐ | Revoke token |

---

## Users

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/users` | ☐ | List users (search); auth required |
| GET | `/api/users/:id` | ☐ | Get user profile |
| PATCH | `/api/users/:id` | ☐ | Update own profile; 403 for others |
| DELETE | `/api/users/:id` | ☐ | Delete own account or admin action |
| PATCH | `/api/users/:id/notification-preferences` | ☐ | Update notification prefs |

---

## Teams

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/teams` | ☐ | List teams user belongs to |
| POST | `/api/teams` | ☐ | Create team |
| GET | `/api/teams/:id` | ☐ | Get team details |
| PATCH | `/api/teams/:id` | ☐ | Update team name/emoji; co-owner only |
| DELETE | `/api/teams/:id` | ☐ | Delete team; co-owner only |
| GET | `/api/teams/:id/members` | ☐ | List team members |
| POST | `/api/teams/:id/members` | ☐ | Add member |
| DELETE | `/api/teams/:id/members/:userId` | ☐ | Remove member |
| PATCH | `/api/teams/:id/members/:userId/role` | ☐ | Change member role |
| GET | `/api/teams/:teamId/invites` | ☐ | List invites |
| POST | `/api/teams/:teamId/invites` | ☐ | Create invite link or email invite |
| DELETE | `/api/teams/:teamId/invites/:inviteId` | ☐ | Delete invite |

---

## Invites (public)

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/invites/:token` | ☐ | Get invite info; no auth |
| POST | `/api/invites/:token/accept` | ☐ | Accept invite; auth required |

---

## Products

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products` | ☐ | List own products |
| POST | `/api/products` | ☐ | Create product; 403 if not allowed by config |
| GET | `/api/products/discover` | ☐ | Products user can request to join |
| GET | `/api/products/:id` | ☐ | Get product; 403 for non-members |
| PATCH | `/api/products/:id` | ☐ | Update product; co-owner only |
| DELETE | `/api/products/:id` | ☐ | Delete product; co-owner only |

---

## Access Requests

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/access-requests` | ☐ | List pending requests; co-owner only |
| POST | `/api/products/:productId/access-requests` | ☐ | Submit request; non-member only |
| PATCH | `/api/products/:productId/access-requests/:requestId` | ☐ | Approve or deny |

---

## Tasks

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/tasks` | ☐ | List tasks; member only |
| POST | `/api/products/:productId/tasks` | ☐ | Create task |
| GET | `/api/products/:productId/tasks/:taskId` | ☐ | Get task detail |
| PATCH | `/api/products/:productId/tasks/:taskId` | ☐ | Update task |
| DELETE | `/api/products/:productId/tasks/:taskId` | ☐ | Delete task |
| PATCH | `/api/products/:productId/tasks/:taskId/position` | ☐ | Update canvas position |
| PATCH | `/api/products/:productId/tasks/reorder` | ☐ | Reorder tasks in column |

---

## Subtasks

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| POST | `/api/products/:productId/tasks/:taskId/subtasks` | ☐ | Add subtask |
| PATCH | `/api/products/:productId/tasks/:taskId/subtasks/:subtaskId` | ☐ | Update (name, order, completed) |
| DELETE | `/api/products/:productId/tasks/:taskId/subtasks/:subtaskId` | ☐ | Delete subtask |

---

## Dependencies

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| POST | `/api/products/:productId/tasks/:taskId/dependencies` | ☐ | Add prerequisite |
| DELETE | `/api/products/:productId/tasks/:taskId/dependencies/:prerequisiteId` | ☐ | Remove prerequisite |

---

## Columns

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/columns` | ☐ | List columns |
| POST | `/api/products/:productId/columns` | ☐ | Create column |
| PATCH | `/api/products/:productId/columns/:columnId` | ☐ | Rename column |
| PATCH | `/api/products/:productId/columns/reorder` | ☐ | Reorder columns |
| DELETE | `/api/products/:productId/columns/:columnId` | ☐ | Delete column; tasks moved |

---

## Sprints

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/sprints` | ☐ | List sprints |
| POST | `/api/products/:productId/sprints` | ☐ | Create sprint |
| PATCH | `/api/products/:productId/sprints/:sprintId` | ☐ | Update sprint |
| DELETE | `/api/products/:productId/sprints/:sprintId` | ☐ | Delete sprint |
| POST | `/api/products/:productId/sprints/:sprintId/tasks` | ☐ | Add task to sprint |
| DELETE | `/api/products/:productId/sprints/:sprintId/tasks/:taskId` | ☐ | Remove task from sprint |

---

## Messages

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/messages` | ☐ | List messages (paginated) |
| POST | `/api/products/:productId/messages` | ☐ | Send message |
| PATCH | `/api/products/:productId/messages/:messageId` | ☐ | Edit message; author only |
| DELETE | `/api/products/:productId/messages/:messageId` | ☐ | Delete; author or co-owner |
| POST | `/api/products/:productId/messages/:messageId/reactions` | ☐ | Add/toggle reaction |

---

## Webhooks

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/webhooks` | ☐ | List webhooks |
| POST | `/api/products/:productId/webhooks` | ☐ | Create webhook (secret returned once) |
| PATCH | `/api/products/:productId/webhooks/:webhookId` | ☐ | Update events/active |
| DELETE | `/api/products/:productId/webhooks/:webhookId` | ☐ | Delete webhook |
| GET | `/api/products/:productId/webhooks/:webhookId/deliveries` | ☐ | Delivery history |
| POST | `/api/products/:productId/webhooks/:webhookId/rotate-secret` | ☐ | Rotate signing secret |

---

## Canvas & Connections

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/connections` | ☐ | List all connections |
| POST | `/api/products/:productId/connections` | ☐ | Create connection |
| GET | `/api/products/:productId/connections/:taskId` | ☐ | Get task's connections |
| DELETE | `/api/products/:productId/connections/:taskId` | ☐ | Remove task's connections |
| GET | `/api/products/:productId/graph` | ☐ | Full dependency graph |
| GET | `/api/products/:productId/canvas-snapshots` | ☐ | List snapshots |
| POST | `/api/products/:productId/canvas-snapshots` | ☐ | Save snapshot |
| DELETE | `/api/products/:productId/canvas-snapshots/:snapshotId` | ☐ | Delete snapshot |

---

## Analytics & Activity

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/analytics` | ☐ | Task completion analytics |
| GET | `/api/products/:productId/analytics/workload` | ☐ | Per-member workload |
| GET | `/api/products/:productId/activity` | ☐ | Activity log |
| GET | `/api/products/:productId/milestones` | ☐ | Tasks with deadlines |
| GET | `/api/products/:productId/export` | ☐ | Full product data export |

---

## Calendar

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/calendar.ics` | ☐ | iCal feed (token auth) |
| POST | `/api/products/:productId/calendar/token` | ☐ | Generate calendar token |
| DELETE | `/api/products/:productId/calendar/token` | ☐ | Revoke calendar token |

---

## Permissions & Colors

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/products/:productId/permissions` | ☐ | Get tab permissions |
| PUT | `/api/products/:productId/permissions` | ☐ | Update tab permissions |
| GET | `/api/products/:productId/color-legend` | ☐ | Get colour labels |
| PUT | `/api/products/:productId/color-legend` | ☐ | Update colour labels |

---

## Realtime

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| POST | `/api/products/:productId/ws-ticket` | ☐ | Issue WS ticket (30s TTL) |
| GET | `/api/products/:productId/ws` | ☐ | WS upgrade endpoint |

---

## Notifications

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/notifications` | ☐ | List own notifications |
| GET | `/api/notifications/unread-count` | ☐ | Count unread |
| PATCH | `/api/notifications/read` | ☐ | Mark specific IDs as read |
| POST | `/api/notifications/read-all` | ☐ | Mark all read |
| DELETE | `/api/notifications/:notificationId` | ☐ | Delete one |
| DELETE | `/api/notifications` | ☐ | Delete all |

---

## Search

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/search` | ☐ | `?q=<query>` across tasks and messages |

---

## Announcements

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/announcements` | ☐ | List announcements for user's teams |
| POST | `/api/announcements` | ☐ | Create; admin or privileged role |
| PATCH | `/api/announcements/:id` | ☐ | Update |
| DELETE | `/api/announcements/:id` | ☐ | Delete |
| GET | `/api/announcements/:id/comments` | ☐ | List comments |
| POST | `/api/announcements/:id/comments` | ☐ | Post comment |
| DELETE | `/api/announcements/:id/comments/:commentId` | ☐ | Delete comment |

---

## Email

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/email-config` | ☐ | Admin only; no password returned |
| PUT | `/api/email-config` | ☐ | Admin only |
| DELETE | `/api/email-config` | ☐ | Admin only |
| GET | `/api/email-status` | ☐ | Admin only |
| POST | `/api/email-status/test` | ☐ | Send test email |

---

## GitHub

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/github/config` | ☐ | Admin only |
| POST | `/api/github/config` | ☐ | Admin only |
| POST | `/api/github/regenerate-secret` | ☐ | Admin only |
| POST | `/api/github/webhook` | ☐ | GitHub signature required |

---

## File Uploads

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| POST | `/api/upload` | ☐ | Auth required; multipart form |
| GET | `/api/uploads/:filename` | ☐ | Auth required |
| DELETE | `/api/uploads/:filename` | ☐ | Auth + ownership required |

---

## Personal export

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/me/export` | ☐ | Current user's own data |
| GET | `/api/me/permissions` | ☐ | All product memberships and permissions |

---

## Admin

| Method | Path | ✓ | Notes |
|--------|------|---|-------|
| GET | `/api/admin/users` | ☐ | Admin only |
| PUT | `/api/admin/users/:id/promote` | ☐ | Admin only |
| PUT | `/api/admin/users/:id/demote` | ☐ | Admin only |
| PUT | `/api/admin/users/:id/unlock` | ☐ | Admin only |
| PUT | `/api/admin/users/:id/verify-email` | ☐ | Admin only |
| DELETE | `/api/admin/users/:id` | ☐ | Admin only |
| GET | `/api/admin/projects` | ☐ | Admin only |
| GET | `/api/admin/server-config` | ☐ | Admin only |
| PUT | `/api/admin/server-config` | ☐ | Admin only |
| PUT | `/api/admin/transfer-crown` | ☐ | Founding admin only |
| GET | `/api/admin/stats` | ☐ | Admin only |
| GET | `/api/admin/logs` | ☐ | Admin only |
| GET | `/api/admin/logs/export` | ☐ | Admin only |
| DELETE | `/api/admin/logs/prune` | ☐ | Founding admin only |
| GET | `/api/admin/whitelist` | ☐ | Admin only |
| POST | `/api/admin/whitelist` | ☐ | Admin only |
| DELETE | `/api/admin/whitelist/:id` | ☐ | Admin only |
| GET | `/api/admin/ip-restrictions` | ☐ | Admin only |
| POST | `/api/admin/ip-restrictions` | ☐ | Admin only |
| PUT | `/api/admin/ip-restrictions/mode` | ☐ | Admin only |
| DELETE | `/api/admin/ip-restrictions/:id` | ☐ | Admin only |
| GET | `/api/admin/chat` | ☐ | Admin only |
| POST | `/api/admin/chat` | ☐ | Admin only |
| PATCH | `/api/admin/chat/:messageId` | ☐ | Admin only |
| DELETE | `/api/admin/chat/:messageId` | ☐ | Admin only |
| POST | `/api/admin/chat/:messageId/reactions` | ☐ | Admin only |
| GET | `/api/admin/notifications` | ☐ | Admin only |
| GET | `/api/admin/notifications/unread-count` | ☐ | Admin only |

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
