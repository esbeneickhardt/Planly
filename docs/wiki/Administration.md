# Administration

The admin panel is available at `/admin` to any user with `isAdmin: true`. The first admin is the **founding admin** (also called the "crown" holder) - this seat is unique and transferable.

---

## Accessing the Admin Panel

If `ADMIN_EMAIL` is set in `.env`, the account with that email becomes admin on startup. Navigate to `/admin` after logging in with that account.

If no admin exists (fresh install with no `ADMIN_EMAIL`), the first registered user does **not** automatically become admin. Set `ADMIN_EMAIL` and restart the stack.

---

## Sections

The admin panel has seven tabs, in this order: **Ownership**, **Users**, **Projects**, **Email Settings**, **Networking**, **Audit Logs**, **Statistics**.

### Ownership

Shows the current server owner (crown icon) alongside every other admin. The founding admin sees a "Transfer ownership" form here to hand the seat to another admin - see [Emergency Crown Transfer](#emergency-crown-transfer) below for the full procedure.

### Users

Table columns: **User** (username, with a crown/shield icon for the founding admin/other admins), **Email**, **Verified**, **Activity**, **Joined**, and - founding admin only - **Actions**.

- **Verified** shows a "Force verify" link next to unverified users, which manually marks their email as verified without requiring the email link.
- **Activity** shows one of: a lockout countdown with an **Unlock** link, a failed-attempt count, or a relative "last active" time (derived from activity on every authenticated request, not just login) - whichever is most relevant for that user.
- **Actions** (founding admin only): **Make admin** / **Demote**, **Force logout** (immediately invalidates all of that user's active sessions), **Reset pw** (generates a one-time temporary password and copies it to the clipboard), and **Delete** (permanent).

**Unlock** - clears `failedLoginAttempts` and `loginLockedUntil` so the user can sign in immediately. It deliberately does **not** reset `loginLockCount` - that counter is preserved so the [progressive lockout schedule](Security.md#progressive-account-lockout) keeps escalating across future incidents instead of quietly resetting to the 15-minute tier every time an admin steps in.

Email whitelist/blocklist management is **not** in this tab - see [Email Settings](#email-settings) below.

### Projects

Lists every active (non-deleted) project across all teams, with owner, member count, task count, deadline, and creation date. Admins can act on any project here regardless of whether they're a member of its team.

- **Change status** - a dropdown per row switches a project between **Active**, **Completed**, and **Archived**. This is the same status field project owners control from their own Settings, exposed here for every project server-wide.
  - Marking a project **Completed** makes it read-only for regular members (owners/co-owners can still edit).
  - Marking a project **Archived** makes it read-only for *everyone*, including the owner.
  - Both transitions **permanently revoke every API token and App Registration token scoped to that project** - not just block them. Reverting to Active does not restore the deleted tokens; a new one must be created. See [Access Tokens → Project scoping](Access-Tokens.md#project-scoping) for why.
  - Reverting a project back to Active only expands access, so it doesn't require confirmation; switching to Completed or Archived does, since both carry the token-revocation consequence.
- **Post into a project's chat** - admins can read and send messages into any project's chat as themselves, optionally badged with a role (Server Owner / Server Admin / Project Owner / Project Co-Owner), for support or internal communication without needing to be added to the team.
- **Deleted projects** - a collapsible section lists soft-deleted projects with their owner, member count, and task count. Each can be:
  - **Restored** - clears the deletion and returns it to the active list.
  - **Permanently deleted** - irreversibly removes the project and all its tasks, messages, and settings. Requires typing the project's exact name to confirm.

### Email Settings

Despite the name, this tab bundles SMTP configuration together with server-wide access-control, security, and announcement policy - everything AdminEmail.tsx renders comes from this one tab.

**SMTP configuration**
- Host, port, "Use SSL" checkbox (unchecked = STARTTLS on port 587, the standard for Gmail/SendGrid/Mailgun; checked = implicit TLS on port 465)
- Username and password (credentials stored encrypted in the database, never re-displayed after saving)
- "From" address
- **Send test** button once configured

**Access controls** (shown once SMTP is configured)
- **Require email verification** - new users must click a verification link before signing in. Toggling this on sends a verification email to every currently-unverified user.
- **Enforce email whitelist** - only addresses/domains on the allowlist can register; entries are added and removed inline once enabled.
- **Enforce email blocklist** - addresses/domains on the blocklist are refused; managed the same way as the whitelist.
- **Allow members to create projects** - when off, only admins can create new projects.

**Security**
- **Require multi-factor authentication** - forces every user through TOTP setup; users without MFA are redirected to the setup page on their next login.

**Announcements**
- **Enable announcement wall** - turns on a server-wide announcement wall for all members (posted content itself is authored on the `/announcements` page, not here).
- **Who can post** - Admins only / Admins + Project owners / All members.

### Networking (IP Restrictions)

Control which IP addresses can reach the app. There's no single on/off mode - two independent panels are shown, each always active:

- **User access** - an allowlist and a blocklist that apply to all non-admin traffic. Admins and server owners are unaffected by these.
- **Admin panel access** - a separate allowlist and blocklist that apply only to `/api/admin/*` routes. Regular users are unaffected by these. Use this to restrict admin actions to, for example, your home network or a company IP range.

Within each panel, the allowlist and blocklist work together:
- An empty allowlist means everyone is allowed (no filtering).
- Adding an entry to the allowlist restricts access to only the listed IPs.
- The blocklist is always checked and always denies a match, even if the same IP is also on the allowlist.

Add rules as CIDR notation: `203.0.113.0/24`, `10.0.0.5/32`, `2001:db8::/32`. Each rule can carry an optional description, and the panel shows your own current IP for reference when adding a rule.

The IP-restriction management endpoints (`/api/admin/ip-restrictions`, `/api/admin/admin-ip-restrictions`) are always exempt from both rule sets so admins can always recover from a misconfiguration.

Localhost (`127.0.0.1`, `::1`) always bypasses both rule sets.

### Audit Logs

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
| `LOGIN` / `LOGIN_FAILED` | Authentication events |
| `LOGIN_LOCKED` | Account locked after too many failed attempts |
| `LOGIN_UNLOCKED` | Admin cleared a lockout |
| `LOGIN_TOTP` | Successful TOTP challenge during login |
| `LOGOUT` | Session ended |
| `USER_REGISTERED` | New account created |
| `PASSWORD_CHANGED` | User changed their own password |
| `PASSWORD_RESET_REQUESTED` / `PASSWORD_RESET_COMPLETED` | Password reset via email link |
| `PASSWORD_RESET_BY_ADMIN` | Admin generated a temporary password for a user |
| `EMAIL_VERIFIED_BY_ADMIN` | Admin manually marked a user's email as verified |
| `TOTP_ENABLED` / `TOTP_DISABLED` | Two-factor auth changes |
| `PAT_CREATED` / `PAT_REVOKED` | Personal access token lifecycle |
| `APP_CREATED` / `APP_DELETED` | App Registration lifecycle |
| `APP_TOKEN_CREATED` / `APP_TOKEN_REVOKED` | App token lifecycle |
| `WEBHOOK_CREATED` / `WEBHOOK_UPDATED` / `WEBHOOK_DELETED` | Webhook lifecycle |
| `WEBHOOK_SECRET_ROTATED` | Webhook signing secret rotated |
| `PERMISSION_UPDATED` | Tab-level permission changed |
| `TEAM_INVITE_SENT` | User invited to a team |
| `TEAM_MEMBER_REMOVED` / `TEAM_MEMBER_ROLE_CHANGED` | Team membership changes |
| `INVITE_ACCEPTED` | Invite link used to join a team |
| `USER_SELF_DELETED` / `USER_DELETED` | Account deleted by its owner, or by the founding admin |
| `USER_PROMOTED` / `USER_DEMOTED` | Admin flag granted or revoked |
| `USER_FORCE_LOGGED_OUT` | Admin invalidated a user's active sessions |
| `CROWN_TRANSFERRED` | Founding admin seat transferred |
| `IP_RULE_ADDED` / `IP_RULE_REMOVED` | User-facing IP allow/blocklist changed |
| `ADMIN_IP_RULE_ADDED` / `ADMIN_IP_RULE_REMOVED` | Admin-panel IP allow/blocklist changed |
| `SERVER_CONFIG_UPDATED` | A Server Config toggle changed |
| `PRODUCT_STATUS_CHANGED` / `PRODUCT_RESTORED` / `PRODUCT_HARD_DELETED` | Project lifecycle actions taken from the admin Projects panel |
| `LOGS_PRUNED` | Nightly retention cleanup removed expired audit log entries |

### Statistics

Server-wide counts at a glance: total users, total projects, total tasks, total messages, number of admins, and number of unverified users - plus 30-day growth deltas for new users and new projects.

### GitHub Integration

Not a tab of its own - configured at the bottom of a project's **Settings → Apps** tab, visible only to admins. Generates a webhook URL (`/api/github/webhook`) to paste into a GitHub repository's webhook settings, plus a rotatable HMAC-SHA256 signing secret. Two independent checkboxes control whether opened issues and/or pull requests are imported as tasks into that project; merging or closing an imported PR updates its linked task's status automatically.

### Admin Chat (not a panel tab)

Distinct from the seven tabs above - click the **Chat** icon in the top bar while in admin mode (toggled by the Shield/Admin button) to open a private message channel visible only to users with `isAdmin: true`, separate from any project's chat. It supports the same features as project chat (emoji reactions, file attachments, replies) and includes a search mode. Messages can be edited by their author within a **15-minute window** after posting, and deleted at any time by their author.

---

## Emergency Crown Transfer

If the founding admin **can still log in**, prefer the in-UI transfer flow: Admin panel → **Ownership** → **Transfer ownership** (visible only to the current founding admin). Pick another admin from the dropdown and confirm - this calls `PUT /api/admin/transfer-crown`, which atomically hands the founding-admin seat to the chosen target while the previous holder keeps their regular admin status. The target must already be an admin.

The procedure below is for the case the founding admin **cannot** log in at all:

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
