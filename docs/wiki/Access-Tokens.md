# Access Tokens

Planly has two token types for programmatic access: **Personal Access Tokens (PATs)** for individual users and **App Registrations** for server-to-server integrations.

---

## Personal Access Tokens (PATs)

A PAT authenticates as you - it has the same permissions as your user account (or a narrower subset if scoped to a project).

### Creating a PAT

**UI:** Click your avatar (top-right) → **Integrations** → **Access Tokens** tab → fill in a name (and optionally an expiry date or read-only) → **Generate**.

**API:**
```http
POST /api/auth/tokens
Authorization: Bearer <existing-token>   # or use cookie session
Content-Type: application/json

{
  "name": "CI deploy script",
  "expiresAt": "2027-01-01T00:00:00Z",  // optional
  "productId": "uuid",                   // optional - scope to one project
  "readOnly": false                      // optional - restrict the token to GET requests
}
```

Response (token shown **once only**):
```json
{
  "id": "uuid",
  "name": "CI deploy script",
  "token": "planly_a3f8...",
  "createdAt": "2026-07-07T00:00:00Z",
  "expiresAt": "2027-01-01T00:00:00Z",
  "productId": null,
  "readOnly": false
}
```

Each user can hold at most **25 tokens**. Creating another once you're at the cap returns `400 Maximum 25 tokens allowed per user. Revoke an existing token first.`

### Using a PAT

Include it as a Bearer token on every request:

```http
Authorization: Bearer planly_a3f8...
```

No `X-CSRF-Token` header needed - Bearer auth bypasses CSRF validation.

### Read-only tokens

Set `"readOnly": true` when creating a token to restrict it to `GET` requests only. Any write method (`POST`, `PUT`, `PATCH`, `DELETE`) is rejected regardless of what the underlying user or project permissions would otherwise allow. Use this for integrations that only need to read data (dashboards, reporting scripts, monitoring).

### Project scoping

If `productId` is set when creating a PAT, the token is locked to that project. Requests to other projects return `403 Token is not authorized for this project`. Admin endpoints always return `403 Scoped tokens cannot access admin endpoints`.

This is useful for CI scripts that should only touch one project and nothing else.

> **Project-scoped tokens are deleted, not just blocked, when the project is marked completed or archived.** Setting a project's status to `completed` or `archived` (via its Settings or from the admin Projects panel) immediately revokes - permanently deletes - every PAT and App Registration token scoped to that project. This applies even to tokens owned by the project's own owner or co-owner. There is no way to recover a revoked token; if the project is later reverted to `active`, you must create a new one. This is a deliberate consequence of the project-lifecycle lockdown: `archived` projects are read-only for everyone (including the owner), and `completed` projects are read-only for everyone except the owner/co-owner, so a scoped token that survived the transition could otherwise be used to write to a project through the API even though the UI blocks it. See [Administration → Projects](Administration.md#projects) for how project status is changed from the admin panel.

### Revoking a PAT

**UI:** Avatar (top-right) → **Integrations** → **Access Tokens** tab → **Revoke** next to the token.

**API:**
```http
DELETE /api/auth/tokens/:tokenId
```

Revocation takes effect immediately.

### Listing PATs

```http
GET /api/auth/tokens
```

Secrets are never returned in list responses.

---

## App Registrations

App Registrations are named service accounts designed for server-to-server integrations. Unlike PATs they are not tied to a specific user - they authenticate as the application itself.

### When to use an App Registration vs a PAT

| | PAT | App Registration |
|---|---|---|
| Identity | Acts as you | Acts as the application |
| Best for | Personal scripts, dev tools | Production integrations, CI/CD |
| Token rotation | Manual | Built-in rotate endpoint |
| Multiple tokens | No | Yes (up to N tokens per app) |

### Creating an App Registration

**UI:** Open a project → **Settings** → **Apps** tab → enter a name → **Create app**. (Unlike PATs, App Registrations are managed from a project's own Settings, not the account menu.)

**API:**
```http
POST /api/apps
Content-Type: application/json

{
  "name": "Slack Integration",
  "description": "Posts task updates to Slack",
  "productId": "uuid"   // optional - scope to one project
}
```

Response:
```json
{
  "id": "uuid",
  "name": "Slack Integration",
  "description": "Posts task updates to Slack",
  "productId": null,
  "createdAt": "2026-07-07T00:00:00Z"
}
```

### Creating a token for an App Registration

```http
POST /api/apps/:appId/tokens
Content-Type: application/json

{
  "name": "production-v1",
  "expiresAt": "2027-07-07T00:00:00Z"   // optional
}
```

Response (token shown **once only**):
```json
{
  "id": "uuid",
  "name": "production-v1",
  "token": "planly_b9c2...",
  "expiresAt": "2027-07-07T00:00:00Z"
}
```

Use it the same way as a PAT:
```http
Authorization: Bearer planly_b9c2...
```

### Rotating tokens

Create a new token, update your integration to use it, then delete the old token. There is no downtime if you switch in that order.

### Revoking tokens

```http
DELETE /api/apps/:appId/tokens/:tokenId
```

### Deleting an App Registration

Deleting an App Registration revokes all its tokens.

```http
DELETE /api/apps/:appId
```

---

## Security Notes

- Store tokens in secrets managers (e.g. GitHub Actions secrets, Vault, AWS Secrets Manager) - never in source code.
- Use the shortest expiry practical for your use case.
- Use project-scoped tokens whenever the integration only needs one project.
- Rotate tokens annually or whenever a team member with access leaves.
- All PAT and App Registration events (create, revoke, token create, token revoke) are recorded in the admin audit log.
