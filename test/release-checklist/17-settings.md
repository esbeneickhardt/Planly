# 17 - Product Settings

← [Back to index](README.md)

Navigate to Settings in Alpha Project. Test as Admin (co-owner), then verify restricted access for Alice (member) and Charlie (outsider).

---

## Team tab (`SettingsTeam`)

> Code: [frontend/src/pages/settings/SettingsTeam.tsx](../../frontend/src/pages/settings/SettingsTeam.tsx) · [backend/src/routes/teams.ts](../../backend/src/routes/teams.ts) (member add/remove/role-change) · [backend/src/routes/access-requests.ts](../../backend/src/routes/access-requests.ts) (pending requests listed here)

- [ ] All team members listed with email, username, role badge
- [ ] Pending access requests listed and actionable
- [ ] "Invite member" button opens invite flow (see [06-teams-products-membership.md](06-teams-products-membership.md))
- [ ] "Promote to co-owner" button visible for co-owners (not regular members)
- [ ] "Remove member" button removes the member
- [ ] Cannot remove yourself if you are the last co-owner → clear error
- [ ] Alice (regular member) cannot see management buttons in this tab → 403 on API

---

## General tab (`SettingsGeneral`)

> Code: [frontend/src/pages/settings/SettingsGeneral.tsx](../../frontend/src/pages/settings/SettingsGeneral.tsx) · [backend/src/routes/products.ts](../../backend/src/routes/products.ts) (`PATCH /api/products/:id` - name, emoji, description, deadline)

- [ ] Product name editable → updates in project picker after save
- [ ] Product emoji editable → updates icon
- [ ] Product description editable
- [ ] Deadline date picker sets/clears project deadline
- [ ] Save → changes persisted; Cancel → changes discarded
- [ ] Regular member (Alice) cannot access Settings → either hidden or 403

---

## Permissions tab (`SettingsPermissions`)

> Code: [frontend/src/pages/settings/SettingsPermissions.tsx](../../frontend/src/pages/settings/SettingsPermissions.tsx) · [backend/src/routes/permissions.ts](../../backend/src/routes/permissions.ts) (`GET/PUT /api/products/:id/permissions`) · [frontend/src/context/PermissionContext.tsx](../../frontend/src/context/PermissionContext.tsx) (applies permission changes live in Alice's browser)

- [ ] All members listed with per-tab permission dropdowns
- [ ] Dropdowns: `write`, `read`, `none` for each tab
- [ ] Change Alice's kanban to `none` → Alice's Kanban tab disappears in Alice's browser
- [ ] Change Alice's analytics to `read` → Alice can view but not edit
- [ ] Change Alice's settings to `write` → Alice can manage settings (make her a co-owner effectively at settings level)
- [ ] Reset to defaults works
- [ ] Non-co-owner cannot change permissions → 403

---

## Colors tab (`SettingsColors`)

> Code: [frontend/src/pages/settings/SettingsColors.tsx](../../frontend/src/pages/settings/SettingsColors.tsx) · [backend/src/routes/color-legend.ts](../../backend/src/routes/color-legend.ts) (`GET/PUT /api/products/:id/color-legend`)

- [ ] Default colours listed
- [ ] Add custom colour with label → appears in Kanban colour filter
- [ ] Rename a colour → updates everywhere
- [ ] Delete a colour → tasks using it are unaffected (retain the hex colour)
- [ ] Maximum colour count (if any) enforced

---

## Webhooks tab (`SettingsWebhooks`)

> Code: [frontend/src/pages/settings/SettingsWebhooks.tsx](../../frontend/src/pages/settings/SettingsWebhooks.tsx) · [backend/src/routes/webhooks.ts](../../backend/src/routes/webhooks.ts)

Full webhook test in [19-webhooks.md](19-webhooks.md). Basic UI check here:

- [ ] Webhook list loads without error
- [ ] "New Webhook" button opens creation form
- [ ] Form fields: URL, events checkboxes, active toggle
- [ ] Created webhook appears in list with URL and active status
- [ ] Edit webhook → saves changes
- [ ] Delete webhook → removed from list
- [ ] Non-co-owner cannot access webhooks tab UI

---

## Apps tab (`SettingsApps`)

> Code: [frontend/src/pages/settings/SettingsApps.tsx](../../frontend/src/pages/settings/SettingsApps.tsx) · [backend/src/routes/app-registrations.ts](../../backend/src/routes/app-registrations.ts)

Full app registration tests in [18-api-tokens-and-apps.md](18-api-tokens-and-apps.md). UI check:

- [ ] App registrations list loads
- [ ] "New App Registration" creates a new one
- [ ] Token visible once after creation; subsequent views show masked value
- [ ] Delete registration → removed from list; existing tokens invalidated

---

## Danger Zone tab (`SettingsDanger`)

> Code: [frontend/src/pages/settings/SettingsDanger.tsx](../../frontend/src/pages/settings/SettingsDanger.tsx) · [backend/src/routes/products.ts](../../backend/src/routes/products.ts) (`DELETE /api/products/:id` - co-owner only) · [backend/src/routes/teams.ts](../../backend/src/routes/teams.ts) (leave = remove self from team members)

- [ ] Non-owner sees "Leave project" button
- [ ] Owner sees "Delete project" button (red)
- [ ] "Leave project" → confirm dialog → user removed; redirected away
- [ ] "Delete project" → confirm dialog with typed confirmation → product deleted everywhere
- [ ] Attempting to leave if you are the last co-owner → clear error with options
- [ ] Attempting to delete → confirm step protects against accidental click

---

## User profile settings

> Code: [frontend/src/components/common/ProfileModal.tsx](../../frontend/src/components/common/ProfileModal.tsx) (avatar emoji, realName, username) · [frontend/src/components/common/DeleteAccountModal.tsx](../../frontend/src/components/common/DeleteAccountModal.tsx) · [backend/src/routes/users.ts](../../backend/src/routes/users.ts) (`GET/PATCH/DELETE /api/users/:id` - own profile only; realName stored encrypted)

- [ ] Upload profile photo → photo appears in messages and assignments
- [ ] Select avatar emoji → emoji shown in lieu of photo
- [ ] Change display name (realName) → shown in profile modal
- [ ] Change username (if allowed) → updates everywhere
- [ ] Delete account modal: `DELETE /api/users/:id` → account removed; session ended

```bash
# Get user profile
curl -s -b alice-cookies.txt $BASE/api/users/<alice-id> | jq .

# Update profile
curl -s -b alice-cookies.txt -X PATCH $BASE/api/users/<alice-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $ALICE_CSRF" \
  -d '{"realName":"Alice Smith","avatarEmoji":"🦊"}' | jq .
```

- [ ] `realName` update persists
- [ ] `avatarEmoji` update persists and shows in messages
- [ ] Cannot update another user's profile → 403

---

## My Permissions page (`GET /api/me/permissions`)

> Code: [backend/src/routes/me-export.ts](../../backend/src/routes/me-export.ts) or permissions route (`/api/me/permissions`) · [frontend/src/context/PermissionContext.tsx](../../frontend/src/context/PermissionContext.tsx) (loads this on login)

```bash
curl -s -b alice-cookies.txt $BASE/api/me/permissions | jq .
```

- [ ] Shows all products Alice is a member of with her role and per-tab permission levels
- [ ] Deleted products do NOT appear
- [ ] Accurate role (member vs co_owner)
- [ ] Accurate tab permissions (matching what was set in Permissions tab)

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
