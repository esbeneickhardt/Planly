# API Reference

All API routes are prefixed with `/api`. The backend serves on port `3000` internally; through the reverse proxy it's available at your domain root.

---

## Contents

- [Authentication](#authentication)
- [Auth Endpoints](#auth-endpoints)
- [Users](#users)
- [Teams](#teams)
- [Projects](#projects-products)
- [Tasks](#tasks)
- [Columns](#columns-kanban-status-columns)
- [Sub-plans](#sub-plans)
- [Invites](#invites)
- [Webhooks](#webhooks)
- [Personal Access Tokens](#personal-access-tokens)
- [Search](#search)
- [Notifications](#notifications)
- [Admin Endpoints](#admin-endpoints)
- [Health Check](#health-check)

---

## Authentication

### Session-based (web app)

Browser clients authenticate via an httpOnly JWT cookie named `token`, set on successful login.

All mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) must also include the `X-CSRF-Token` header with the value from the non-httpOnly `csrf` cookie:

```http
X-CSRF-Token: <value-of-csrf-cookie>
```

### Token-based (API clients)

Include a Personal Access Token or App Registration token as a Bearer header:

```http
Authorization: Bearer planly_<token>
```

Bearer auth bypasses CSRF checks - no `X-CSRF-Token` header needed. See [Access Tokens](Access-Tokens.md) for how to create tokens.

---

## Auth Endpoints

### POST /api/auth/register

Create a new user account.

```json
// Request
{ "email": "alice@example.com", "username": "alice", "password": "s3cur3pass" }

// Response 201
{ "message": "Registration successful. Please check your email to verify your account." }
```

### POST /api/auth/login

```json
// Request
{ "email": "alice@example.com", "password": "s3cur3pass" }

// Response 200 - no TOTP
{ "user": { "id": "...", "username": "alice", "email": "...", "isAdmin": false } }

// Response 200 - TOTP required
{ "mfaRequired": true, "challengeToken": "<short-lived-jwt>" }
```

Sets `token` (httpOnly) and `csrf` cookies on success.

### POST /api/auth/totp/challenge

Complete login after TOTP challenge.

```json
// Request
{ "challengeToken": "<jwt-from-login>", "code": "123456" }

// Response 200
{ "user": { ... } }
```

### POST /api/auth/logout

Clears session cookies. No request body needed.

### GET /api/auth/me

Returns the currently authenticated user.

```json
// Response 200
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@example.com",
  "realName": null,
  "isAdmin": false,
  "emailVerified": true,
  "totpEnabled": false,
  "avatarEmoji": "🦊"
}
```

### POST /api/auth/change-password

```json
{ "currentPassword": "old", "newPassword": "new-s3cure" }
```

Increments `tokenVersion` - invalidates all existing sessions.

### POST /api/auth/forgot-password

```json
{ "email": "alice@example.com" }
// Always responds 200 (no user enumeration)
```

### POST /api/auth/reset-password

```json
{ "token": "<reset-token>", "password": "new-password" }
```

---

## Users

### GET /api/users

List all users (auth required).

```json
[{ "id": "...", "username": "alice", "realName": null, "avatarEmoji": "🦊" }]
```

### PATCH /api/users/me

Update your own profile.

```json
// Request
{ "realName": "Alice Smith", "avatarEmoji": "🐙", "timezone": "Europe/Copenhagen" }
```

### DELETE /api/users/me

Delete your own account. Irreversible. Removes the user from all teams.

---

## Teams

### GET /api/teams

List all teams the authenticated user belongs to.

### POST /api/teams

```json
// Request
{ "name": "Engineering", "emoji": "⚙️" }

// Response 201
{ "id": "uuid", "name": "Engineering", "emoji": "⚙️", "createdAt": "..." }
```

### GET /api/teams/:teamId

Get team details including members.

### PATCH /api/teams/:teamId

Update team name or emoji (co-owner required).

### DELETE /api/teams/:teamId

Delete the team and all its projects (founding admin only).

### GET /api/teams/:teamId/members

List team members with roles.

### PATCH /api/teams/:teamId/members/:userId

Change a member's role.

```json
{ "role": "co_owner" }   // or "member"
```

### DELETE /api/teams/:teamId/members/:userId

Remove a member from the team.

---

## Projects (Products)

### GET /api/teams/:teamId/products

List all projects in a team.

### POST /api/teams/:teamId/products

```json
// Request
{ "name": "API Redesign", "emoji": "🔌", "description": "Optional" }

// Response 201
{ "id": "uuid", "name": "API Redesign", "emoji": "🔌", "teamId": "...", "createdAt": "..." }
```

### GET /api/products/:productId

Get a single project.

### PATCH /api/products/:productId

Update project name, emoji, or description.

### DELETE /api/products/:productId

Soft-delete the project (co-owner required).

---

## Tasks

### GET /api/products/:productId/tasks

List all tasks in a project.

```
Query parameters:
  status=<column-id>
  assigneeId=<user-id>
  sprintId=<sprint-id>
  search=<text>
```

### POST /api/products/:productId/tasks

```json
// Request
{
  "name": "Fix login bug",
  "description": "Users can't log in with SSO",
  "statusId": "column-uuid",
  "assigneeId": "user-uuid",
  "priority": "high",
  "dueDate": "2026-08-01T00:00:00Z",
  "sprintId": "sprint-uuid"
}

// Response 201
{ "id": "uuid", "name": "Fix login bug", ... }
```

### GET /api/tasks/:taskId

Get a single task with subtasks, assignee, labels, and comments.

### PATCH /api/tasks/:taskId

Update any task field. Only send fields you want to change.

```json
{ "name": "Updated title", "priority": "critical" }
```

### DELETE /api/tasks/:taskId

Soft-delete the task (moves to recycle bin, hard-deleted after 365 days).

### GET /api/tasks/:taskId/comments

### POST /api/tasks/:taskId/comments

```json
{ "content": "This is a comment. @bob can you look at this?" }
```

---

## Columns (Kanban Status Columns)

### GET /api/products/:productId/columns

### POST /api/products/:productId/columns

```json
{ "name": "In Review", "position": 2 }
```

### PATCH /api/products/:productId/columns/:columnId

```json
{ "name": "Code Review", "position": 3 }
```

### DELETE /api/products/:productId/columns/:columnId

---

## Sub-plans

### GET /api/products/:productId/sprints

### POST /api/products/:productId/sprints

```json
{ "name": "Sub-plan 1", "startDate": "2026-08-01", "endDate": "2026-08-14" }
```

### PATCH /api/products/:productId/sprints/:sprintId

### POST /api/products/:productId/sprints/:sprintId/end

End the sub-plan. Returns a summary of completed vs carried-over tasks.

---

## Invites

### GET /api/teams/:teamId/invites

List active invites (co-owner required).

### POST /api/teams/:teamId/invites

```json
// Open invite (shareable link, optional use cap)
{ "maxUses": 50 }

// Email-targeted invite (single-use, sends email if SMTP configured)
{ "email": "bob@example.com" }

// Response 201
{
  "id": "uuid",
  "inviteUrl": "https://planly.yourdomain.com/invite/<token>",
  "expiresAt": "2026-07-14T00:00:00Z",
  "maxUses": 50
}
```

### DELETE /api/teams/:teamId/invites/:inviteId

Revoke an invite.

### GET /api/invites/:token

Get invite info (public - no auth required). Used by the accept page to show team name before login.

### POST /api/invites/:token/accept

Join the team using the invite token (auth required).

---

## Webhooks

### GET /api/products/:productId/webhooks

### POST /api/products/:productId/webhooks

```json
// Request
{
  "url": "https://hooks.example.com/planly",
  "events": ["task.created", "task.updated", "task.deleted"],
  "active": true
}

// Response 201 - secret only returned at creation
{
  "id": "uuid",
  "url": "https://hooks.example.com/planly",
  "events": ["task.created", "task.updated", "task.deleted"],
  "active": true,
  "secret": "planly_wh_<hex>"  // store this, it's shown only once
}
```

### PATCH /api/products/:productId/webhooks/:webhookId

Update URL, events, or active state.

### DELETE /api/products/:productId/webhooks/:webhookId

### POST /api/products/:productId/webhooks/:webhookId/rotate-secret

Rotates the signing secret. Returns the new secret (shown once).

### GET /api/products/:productId/webhooks/:webhookId/deliveries

List recent webhook delivery attempts with status codes.

See [Webhooks](Webhooks.md) for the event catalog and payload format.

---

## Personal Access Tokens

### GET /api/auth/tokens

List your PATs (secrets are not returned).

### POST /api/auth/tokens

```json
// Request
{
  "name": "CI deploy script",
  "expiresAt": "2027-01-01T00:00:00Z",  // optional
  "productId": "uuid"                    // optional - scopes token to one project
}

// Response 201 - token only returned at creation
{ "id": "uuid", "name": "CI deploy script", "token": "planly_<hex>", "expiresAt": "..." }
```

### DELETE /api/auth/tokens/:tokenId

Revoke a PAT.

See [Access Tokens](Access-Tokens.md) for full usage.

---

## Search

### GET /api/search?q=<query>

Full-text search across tasks and messages the user has access to.

```json
{
  "tasks": [
    { "id": "...", "name": "Fix login bug", "product": { "id": "...", "name": "API" } }
  ],
  "messages": [
    { "id": "...", "content": "Has anyone looked at the login bug?", "product": { ... }, "author": { ... } }
  ]
}
```

---

## Notifications

### GET /api/notifications

List unread notifications for the authenticated user.

### POST /api/notifications/:notificationId/read

Mark a notification as read.

### POST /api/notifications/read-all

Mark all notifications as read.

---

## Admin Endpoints

All `/api/admin/*` endpoints require `isAdmin: true`.

### GET /api/admin/users

List all users with admin metadata.

### POST /api/admin/users/:userId/unlock

Reset login lockout for a user.

### DELETE /api/admin/users/:userId

Hard-delete a user account.

### GET /api/admin/logs

Query the admin audit log.

```
Query parameters:
  page=1
  limit=50
  action=LOGIN_SUCCESS
  actorName=alice
  from=2026-01-01
  to=2026-07-01
```

### GET /api/admin/logs/export?format=csv

Export the full audit log. `format` can be `csv` or `jsonl`.

### GET /api/admin/server-config

### PATCH /api/admin/server-config

```json
{
  "requireEmailVerification": true,
  "allowRegistration": true,
  "requireWhitelist": false,
  "ipRestrictionMode": "disabled"
}
```

### Health Check

### GET /api/health

Public endpoint. Returns `200` with `{ "ok": true, "db": "connected" }` or `503` if the database is unreachable.
