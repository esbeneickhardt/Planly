# Administration

The admin panel is available at `/admin` to any user with `isAdmin: true`. The first admin is the **founding admin** (also called the "crown" holder) - this seat is unique and transferable.

---

## Accessing the Admin Panel

If `ADMIN_EMAIL` is set in `.env`, the account with that email becomes admin on startup. Navigate to `/admin` after logging in with that account.

If no admin exists (fresh install with no `ADMIN_EMAIL`), the first registered user does **not** automatically become admin. Set `ADMIN_EMAIL` and restart the stack.

---

## Sections

### Dashboard

Overview of active users, projects, teams, recent events, and system health. Links to the most common admin tasks.

### Users

Full user list with:
- Email, username, verification status
- Admin flag toggle (grant or revoke admin access)
- Last login timestamp
- Active session count
- Quick actions: **Unlock** (clear lockout), **Delete** (permanent)

**Unlock** - resets `loginLockCount` to 0 and clears the lockout timestamp. Use this when a user has been locked out after too many failed attempts and can't wait for the lockout to expire.

**Whitelist** - if `requireWhitelist` is enabled in Server Config, only whitelisted emails can register. Manage the whitelist here.

### Teams

View all teams, their members, and projects. Admins can:
- Delete any team
- Remove any member
- Force-accept or deny access requests

### Announcements

Create server-wide announcements that appear at the top of the app for all users. Supports markdown. Can be pinned (sticky) or time-limited.

### Email (SMTP)

Configure the outgoing email server. Credentials are stored encrypted in the database.

Fields:
- Host, port, STARTTLS toggle
- Username and password
- "From" address
- Test button to send a verification email

### Audit Log

Full chronological log of admin-relevant events. Each entry records:
- **Action** - what happened (e.g. `LOGIN_FAILED`, `WEBHOOK_CREATED`, `PERMISSION_UPDATED`)
- **Actor** - who did it (username or `SYSTEM`)
- **Target** - who or what was affected
- **Metadata** - structured details (IP address, old/new values, etc.)
- **Timestamp**

#### Filtering

Filter by action type, actor, target, or date range using the controls above the log.

#### Exporting

Click **Export** to download the log as:
- **CSV** - opens in Excel / Google Sheets
- **JSONL** - one JSON object per line for log ingestion pipelines

#### Retention

Log entries older than `ADMIN_LOG_RETENTION_DAYS` (default: 90) are automatically deleted by the nightly cleanup job.

#### Logged actions

| Action | Description |
|---|---|
| `LOGIN_SUCCESS` / `LOGIN_FAILED` | Authentication events |
| `LOGOUT` | Session ended |
| `ACCOUNT_LOCKED` | Account locked after too many failed attempts |
| `PASSWORD_CHANGED` | User changed their own password |
| `PASSWORD_RESET` | Password reset via email link |
| `TOTP_ENABLED` / `TOTP_DISABLED` | Two-factor auth changes |
| `PAT_CREATED` / `PAT_REVOKED` | Personal access token lifecycle |
| `APP_CREATED` / `APP_DELETED` | App Registration lifecycle |
| `APP_TOKEN_CREATED` / `APP_TOKEN_REVOKED` | App token lifecycle |
| `WEBHOOK_CREATED` / `WEBHOOK_UPDATED` / `WEBHOOK_DELETED` | Webhook lifecycle |
| `WEBHOOK_SECRET_ROTATED` | Webhook signing secret rotated |
| `PERMISSION_UPDATED` | Tab-level permission changed |
| `TEAM_MEMBER_ADDED` / `TEAM_MEMBER_REMOVED` / `TEAM_MEMBER_ROLE_CHANGED` | Team membership changes |
| `USER_SELF_DELETED` | User deleted their own account |
| `INVITE_ACCEPTED` | Invite link used to join a team |
| `CROWN_TRANSFERRED` | Founding admin seat transferred |
| `ADMIN_GRANTED` / `ADMIN_REVOKED` | Admin flag changed |

### IP Restrictions

Control which IP addresses can reach the app.

**Modes:**
- **Disabled** - no IP filtering (default)
- **Allowlist** - only listed CIDRs can access the app
- **Blocklist** - listed CIDRs are denied

Add rules as CIDR notation: `203.0.113.0/24`, `10.0.0.5/32`, `2001:db8::/32`.

The `/api/admin/ip-restrictions` endpoint is always exempt from IP filtering so admins can always recover from a misconfiguration.

Localhost (`127.0.0.1`, `::1`) is always allowed regardless of mode.

### Server Config

Toggle server-wide settings:

| Setting | Description |
|---|---|
| **Require email verification** | Users must verify their email before using the app |
| **Allow registration** | Disable to prevent new accounts entirely |
| **Require whitelist** | Only emails in the whitelist can register |
| **IP restriction mode** | Disabled / Allowlist / Blocklist |

---

## Emergency Crown Transfer

If the founding admin loses access to their account and cannot log in:

1. Set `RECROWN_EMAIL=new-admin@example.com` in `.env`
2. Restart the stack: `docker compose restart backend`
3. The founding-admin seat is transferred to that account on startup
4. Remove `RECROWN_EMAIL` from `.env` and restart again to clear the warning message

This is logged to the audit log as `CROWN_TRANSFERRED` with actor `SYSTEM (RECROWN_EMAIL)`.

---

## Data Retention (Nightly Cleanup)

The backend runs a cleanup job 30 seconds after startup and then every 24 hours:

| Data | Retention |
|---|---|
| Notifications | 90 days |
| Activity events | 180 days |
| Soft-deleted tasks | 365 days (then hard-deleted) |
| Admin audit logs | Configurable (`ADMIN_LOG_RETENTION_DAYS`, default 90) |
| Expired SSO states | Cleaned immediately on expiry |
| Expired WebSocket tickets | Cleaned immediately on expiry |
