# 05 - Admin Panel

← [Back to index](README.md)

Log in as **Admin** (Account A from [01-setup.md](01-setup.md)) for all checks in this section.

---

## Access control

> Code: [middleware/auth.ts](../../backend/src/middleware/auth.ts) (`requireAdmin` guard used on all `/api/admin/*` routes) · [frontend/src/pages/AdminPage.tsx](../../frontend/src/pages/AdminPage.tsx) (redirects non-admins away)

- [ ] Shield button 🛡 visible for Admin, invisible for Alice, Bob, Charlie
- [ ] Navigating to `/admin` as Alice → silently redirected to `/kanban`
- [ ] Navigating to `/admin` as Charlie → silently redirected

---

## Admin mode UX

> Code: [frontend/src/pages/AdminPage.tsx](../../frontend/src/pages/AdminPage.tsx) · [frontend/src/components/common/TopBar.tsx](../../frontend/src/components/common/TopBar.tsx) (shield button, admin-mode styling)

- [ ] Shield button highlighted (brand colour, ring) when on `/admin`
- [ ] Clicking shield when NOT on admin → navigates to `/admin`, center nav shows admin tabs
- [ ] Clicking shield when ON admin → exits to `/kanban`
- [ ] Admin tabs visible: **Ownership**, **Users**, **Projects**, **Email**, **Audit Logs**, **Stats**
- [ ] URL search param `?tab=ownership` drives active tab
- [ ] Project dropdown shows "Admin" label when in admin mode
- [ ] Project dropdown shows "Select a project to leave admin mode" hint

---

## Ownership tab (`GET /api/admin/users` + `PUT /api/admin/transfer-crown`)

> Code: [backend/src/routes/admin/config.ts](../../backend/src/routes/admin/config.ts) (`transfer-crown` endpoint, `RECROWN_EMAIL` env var handling) · [frontend/src/pages/admin/AdminOwnership.tsx](../../frontend/src/pages/admin/AdminOwnership.tsx)

- [ ] Founding admin shown with 👑 badge
- [ ] "Transfer server ownership" section visible only to founding admin
- [ ] Select another admin (promote Alice or Bob first) → click Transfer → confirm dialog
- [ ] After transfer: new user has 👑, old user retains Admin badge but loses 👑
- [ ] New founding admin can access founding-admin-only actions
- [ ] Old founding admin cannot perform founding-admin actions
- [ ] Restart backend → `ADMIN_EMAIL` account stays admin but does NOT reclaim 👑
- [ ] `RECROWN_EMAIL` env var transfers 👑 on restart (test and then remove from .env)

```bash
# Transfer crown
curl -s -b cookies.txt -X PUT $BASE/api/admin/transfer-crown \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"targetUserId":"<bob-id>"}' | jq .
```

---

## Users tab

> Code: [backend/src/routes/admin/users.ts](../../backend/src/routes/admin/users.ts) · [frontend/src/pages/admin/AdminUsers.tsx](../../frontend/src/pages/admin/AdminUsers.tsx)

```bash
# List all users
curl -s -b cookies.txt $BASE/api/admin/users | jq '.[] | {id, username, email, isAdmin}'
```

- [ ] All registered users listed: email, username, join date, verification status, login info
- [ ] Founding admin shows 👑, other admins show Admin badge
- [ ] Lock status badge shows for locked accounts

### Promote / demote admin

> Code: [backend/src/routes/admin/users.ts](../../backend/src/routes/admin/users.ts) (`promote`/`demote` endpoints - prevents demoting founding admin or last admin)

```bash
# Promote Alice
curl -s -b cookies.txt -X PUT $BASE/api/admin/users/<alice-id>/promote \
  -H "X-CSRF-Token: $CSRF" | jq .

# Demote Alice
curl -s -b cookies.txt -X PUT $BASE/api/admin/users/<alice-id>/demote \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Promote Alice → Admin badge appears in Users tab
- [ ] Demote Alice → badge removed
- [ ] Cannot demote the last admin → clear error
- [ ] Cannot demote the founding admin → clear error
- [ ] Founding admin cannot demote themselves

### Force verify email

```bash
curl -s -b cookies.txt -X PUT $BASE/api/admin/users/<user-id>/verify-email \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Force-verify an unverified user → `emailVerified` becomes true
- [ ] User can now log in (if email verification enforcement is on)

### Unlock account

> Code: [backend/src/routes/admin/users.ts](../../backend/src/routes/admin/users.ts) (`unlock` - resets `loginFailCount`, `loginLockedUntil`, `loginLockCount`)

```bash
curl -s -b cookies.txt -X PUT $BASE/api/admin/users/<user-id>/unlock \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Unlock a locked account → lock badge disappears
- [ ] User can log in immediately with correct password

### Delete user

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/admin/users/<user-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Delete a regular user → removed from admin user list
- [ ] Cannot delete yourself → 400 with clear error
- [ ] Cannot delete the founding admin → clear error
- [ ] Deleted user cannot log in

**Data residue checks after admin-deleting a user:**

- [ ] Tasks the user owned still exist - `ownerId` set to `null` (unassigned), task not deleted
- [ ] Tasks the user was reviewing still exist - `reviewerId` set to `null`
- [ ] Messages the user sent in task chats are **deleted**
- [ ] Announcements they authored survive and display as "Deleted user"
- [ ] Their team memberships are removed

---

## Projects tab (`GET /api/admin/projects`)

> Code: [backend/src/routes/admin/stats.ts](../../backend/src/routes/admin/stats.ts) or admin route (check which file handles `/api/admin/projects`) · [frontend/src/pages/admin/AdminProjects.tsx](../../frontend/src/pages/admin/AdminProjects.tsx)

```bash
curl -s -b cookies.txt $BASE/api/admin/projects | jq '.[].name'
```

- [ ] All server projects listed with owner, member count, task count
- [ ] Shows creation date

---

## Email / SMTP tab

> Code: [backend/src/routes/admin/config.ts](../../backend/src/routes/admin/config.ts) (email-config CRUD - password encrypted at rest, not returned in GET) · [frontend/src/pages/admin/AdminEmail.tsx](../../frontend/src/pages/admin/AdminEmail.tsx)

See also [16-settings.md](16-settings.md) for product-level email tests.

```bash
# Get current email config
curl -s -b cookies.txt $BASE/api/email-config | jq .

# Save config
curl -s -b cookies.txt -X PUT $BASE/api/email-config \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"host":"smtp.gmail.com","port":587,"secure":false,"user":"test@gmail.com","pass":"apppass","from":"Planly <test@gmail.com>"}' | jq .

# Test email
curl -s -b cookies.txt -X POST $BASE/api/email-status/test \
  -H "X-CSRF-Token: $CSRF" | jq .

# Delete config (revert to env vars)
curl -s -b cookies.txt -X DELETE $BASE/api/email-config \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] SMTP status banner shows "Email is active" (green) or "Email not configured" (amber)
- [ ] Form pre-filled with saved values; password field shows masked placeholder
- [ ] Saving config → status updates without restart
- [ ] Test email → arrives in inbox (or appears in logs)
- [ ] Deleting config reverts to env-var fallback
- [ ] SMTP password is NOT returned in `GET /api/email-config` response (only host/port/user/from)
- [ ] "Require email verification" toggle only shown when email IS configured
- [ ] Enabling email verification sends emails to all unverified users
- [ ] Enabling email verification does NOT re-send to already-verified users

### Email whitelist

> Code: [backend/src/routes/admin/config.ts](../../backend/src/routes/admin/config.ts) (whitelist CRUD) · [backend/src/utils/server-config.ts](../../backend/src/utils/server-config.ts) (`requireWhitelist` flag) · [backend/src/routes/auth.ts](../../backend/src/routes/auth.ts) (whitelist check on registration)

```bash
# Enable whitelist
curl -s -b cookies.txt -X PUT $BASE/api/admin/server-config \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"requireWhitelist":true}' | jq .

# Add domain
curl -s -b cookies.txt -X POST $BASE/api/admin/whitelist \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"pattern":"@company.com"}' | jq .

# List whitelist
curl -s -b cookies.txt $BASE/api/admin/whitelist | jq .

# Remove entry
curl -s -b cookies.txt -X DELETE $BASE/api/admin/whitelist/<id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Add a domain → appears in list
- [ ] Add an exact address → appears in list
- [ ] Invalid pattern → clear error
- [ ] Remove entry → removed
- [ ] Registration with non-whitelisted email fails
- [ ] Registration with whitelisted email succeeds
- [ ] `ADMIN_EMAIL` always bypasses whitelist

---

## Audit Logs tab

> Code: [backend/src/routes/admin/logs.ts](../../backend/src/routes/admin/logs.ts) (list with cursor pagination, export CSV/JSONL, prune - founding-admin only) · [frontend/src/pages/admin/AdminLogs.tsx](../../frontend/src/pages/admin/AdminLogs.tsx)

```bash
# List logs
curl -s -b cookies.txt "$BASE/api/admin/logs?limit=10" | jq .

# Filter by action
curl -s -b cookies.txt "$BASE/api/admin/logs?action=LOGIN_FAILED" | jq '.logs[].action'

# Export CSV
curl -s -b cookies.txt "$BASE/api/admin/logs/export?format=csv" -o audit.csv
head -2 audit.csv

# Export JSONL
curl -s -b cookies.txt "$BASE/api/admin/logs/export?format=jsonl" | head -3
```

- [ ] Log entries shown newest first with actor name and coloured badge
- [ ] Filter by action type → list updates
- [ ] Filter by date range → list updates
- [ ] "Load more" pagination works without resetting filters
- [ ] CSV export downloads a valid file
- [ ] Export respects active filters
- [ ] Prune section visible only to founding admin
- [ ] After prune, new `LOGS_PRUNED` entry appears at top

```bash
# Prune (founding admin only)
curl -s -b cookies.txt -X DELETE "$BASE/api/admin/logs/prune?olderThanDays=30" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

---

## Statistics tab (`GET /api/admin/stats`)

> Code: [backend/src/routes/admin/stats.ts](../../backend/src/routes/admin/stats.ts) · [frontend/src/pages/admin/AdminStats.tsx](../../frontend/src/pages/admin/AdminStats.tsx)

```bash
curl -s -b cookies.txt $BASE/api/admin/stats | jq .
```

- [ ] Stats page loads with user, project, task, message counts and "+N last 30 days" labels

---

## IP Restrictions tab

> Code: [backend/src/routes/ip-restrictions.ts](../../backend/src/routes/ip-restrictions.ts) (CIDR rule CRUD, mode toggle; admin users exempted) · [frontend/src/pages/admin/AdminIpRules.tsx](../../frontend/src/pages/admin/AdminIpRules.tsx)

```bash
# Set mode
curl -s -b cookies.txt -X PUT $BASE/api/admin/ip-restrictions/mode \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"mode":"allowlist"}' | jq .

# Add a rule
curl -s -b cookies.txt -X POST $BASE/api/admin/ip-restrictions \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"cidr":"127.0.0.1/32","note":"localhost"}' | jq .

# List rules
curl -s -b cookies.txt $BASE/api/admin/ip-restrictions | jq .

# Delete rule
curl -s -b cookies.txt -X DELETE $BASE/api/admin/ip-restrictions/<id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Mode can be set to `allowlist`, `blocklist`, or `off`
- [ ] Adding an allowlist rule with localhost CIDR + setting mode to allowlist → non-localhost IPs blocked
- [ ] Admin users are exempt from IP restrictions
- [ ] Invalid CIDR → clear validation error
- [ ] Deleting all rules + setting mode to `off` restores open access

---

## Admin chat (`/api/admin/chat`)

> Code: [backend/src/routes/admin-chat.ts](../../backend/src/routes/admin-chat.ts) (admin-only message CRUD + reactions)

```bash
# Post message
curl -s -b cookies.txt -X POST $BASE/api/admin/chat \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"content":"Test admin chat message"}' | jq .

# Get messages
curl -s -b cookies.txt $BASE/api/admin/chat | jq '.[].content'
```

- [ ] Admin can post to admin chat
- [ ] Admin can edit admin chat messages
- [ ] Admin can delete admin chat messages
- [ ] Non-admin cannot access `/api/admin/chat` → 403

---

## Server config (`GET/PUT /api/admin/server-config`)

> Code: [backend/src/routes/admin/config.ts](../../backend/src/routes/admin/config.ts) · [backend/src/utils/server-config.ts](../../backend/src/utils/server-config.ts) (defaults - `allowProjectCreation` defaults to `true`)

```bash
curl -s -b cookies.txt $BASE/api/admin/server-config | jq .

curl -s -b cookies.txt -X PUT $BASE/api/admin/server-config \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"allowProjectCreation":true,"announcementsEnabled":true}' | jq .
```

- [ ] Each toggle persists after restart
- [ ] `allowProjectCreation: false` → regular users cannot create projects
- [ ] `announcementsEnabled: false` → Announcements tab disappears for all users

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
