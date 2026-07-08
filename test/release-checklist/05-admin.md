# 05 — Admin Panel

← [Back to index](README.md)

Log in as **Admin** (Account A from [01-setup.md](01-setup.md)) for all checks in this section.

---

## Access control

- [ ] Shield button 🛡 visible for Admin, invisible for Alice, Bob, Charlie
- [ ] Navigating to `/admin` as Alice → silently redirected to `/kanban`
- [ ] Navigating to `/admin` as Charlie → silently redirected
- [ ] API: `GET /api/admin/server-config` as Alice → 403
- [ ] API: `GET /api/admin/users` without auth → 401

---

## Admin mode UX

- [ ] Shield button highlighted (brand colour, ring) when on `/admin`
- [ ] Clicking shield when NOT on admin → navigates to `/admin`, center nav shows admin tabs
- [ ] Clicking shield when ON admin → exits to `/kanban`
- [ ] Admin tabs visible: **Ownership**, **Users**, **Projects**, **Email**, **Audit Logs**, **Stats**
- [ ] URL search param `?tab=ownership` drives active tab
- [ ] Project dropdown shows "Admin" label when in admin mode
- [ ] Project dropdown shows "Select a project to leave admin mode" hint

---

## Ownership tab (`GET /api/admin/users` + `PUT /api/admin/transfer-crown`)

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

```bash
# List all users
curl -s -b cookies.txt $BASE/api/admin/users | jq '.[] | {id, username, email, isAdmin}'
```

- [ ] All registered users listed: email, username, join date, verification status, login info
- [ ] Founding admin shows 👑, other admins show Admin badge
- [ ] Lock status badge shows for locked accounts

### Promote / demote admin

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

```bash
curl -s -b cookies.txt -X PUT $BASE/api/admin/users/<user-id>/unlock \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Unlock a locked account → lock badge disappears
- [ ] User can log in immediately with correct password
- [ ] `loginLockCount` reset to 0 (verify via subsequent lockout counting)

### Delete user

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/admin/users/<user-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Delete a regular user → removed from list; their data handled gracefully
- [ ] Cannot delete yourself → clear error
- [ ] Cannot delete the founding admin → clear error
- [ ] Deleted user cannot log in

---

## Projects tab (`GET /api/admin/projects`)

```bash
curl -s -b cookies.txt $BASE/api/admin/projects | jq '.[].name'
```

- [ ] All server projects listed with owner, member count, task count
- [ ] Shows creation date

---

## Email / SMTP tab

See also [17-settings.md](17-settings.md) for product-level email tests.

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

- [ ] Log entries shown newest first
- [ ] Action badge coloured: red for FAIL/DELETE/PRUNE, purple for others
- [ ] Actor and target names shown (not just IDs)
- [ ] Filter by action type → list updates
- [ ] Filter by date range (from/to) → list updates
- [ ] "Load more" / cursor pagination loads next page without resetting filters
- [ ] CSV export: correct headers (`id,action,actorId,...`), correct values
- [ ] JSONL export: one JSON object per line
- [ ] Export respects active filters
- [ ] Non-admin `GET /api/admin/logs` → 403
- [ ] Prune section visible only to founding admin
- [ ] `DELETE /api/admin/logs/prune?olderThanDays=90` removes old entries
- [ ] After prune, new `LOGS_PRUNED` entry appears at top

```bash
# Prune (founding admin only)
curl -s -b cookies.txt -X DELETE "$BASE/api/admin/logs/prune?olderThanDays=30" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

---

## Statistics tab (`GET /api/admin/stats`)

```bash
curl -s -b cookies.txt $BASE/api/admin/stats | jq .
```

- [ ] Total users, projects, teams, tasks, messages counts shown
- [ ] "+N last 30 days" sub-labels for users and projects
- [ ] Admin count correct
- [ ] Unverified user count correct

---

## IP Restrictions tab

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

```bash
curl -s -b cookies.txt $BASE/api/admin/server-config | jq .

curl -s -b cookies.txt -X PUT $BASE/api/admin/server-config \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"allowProjectCreation":true,"announcementsEnabled":true}' | jq .
```

- [ ] All fields returned: `requireEmailVerification`, `requireWhitelist`, `allowProjectCreation`, `announcementsEnabled`, `announcementPostRole`
- [ ] Each toggle persists after restart
- [ ] `allowProjectCreation: false` → regular users cannot create products
- [ ] `announcementsEnabled: false` → Announcements tab disappears for all users

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
