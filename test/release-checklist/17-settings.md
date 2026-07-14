# 17 - Product Settings

← [Back to index](README.md)

Navigate to Settings in Alpha Project. Test as Admin (co-owner), then verify restricted access for Alice (member) and Charlie (outsider).

---

## Team tab (`SettingsTeam`)

> Code: [frontend/src/pages/settings/SettingsTeam.tsx](../../frontend/src/pages/settings/SettingsTeam.tsx) · [backend/src/routes/teams.ts](../../backend/src/routes/teams.ts) (invite/remove/role-change) · [backend/src/routes/invites.ts](../../backend/src/routes/invites.ts) (pending invite list) · [backend/src/routes/access-requests.ts](../../backend/src/routes/access-requests.ts) (pending requests listed here)

- [ ] Active members listed with username, role badge (Owner / Co-owner / none)
- [ ] Pending access requests listed and actionable

### Invite flow (from the project owner's side)

- [ ] Type `charlie` in the "Invite member" search → Charlie appears in the dropdown
- [ ] Click **Invite** → toast "Invitation sent to charlie" shown
- [ ] Charlie appears in the Members list immediately with a yellow **Pending** badge and an **Uninvite** button
- [ ] Charlie does NOT appear as a full member (no Owner/Co-owner/member row)
- [ ] Click **Uninvite** → Charlie's pending row disappears and the invite is revoked

### Notification delivery (from the invited user's side)

- [ ] Log in as Charlie (who has no projects)
- [ ] Bell badge appears immediately — unread count ≥ 1 even though Charlie's active product is undefined
- [ ] Open the bell → notification titled `You've been invited to "Alpha Project"` is visible
- [ ] Notification shows the inviter's username in the body
- [ ] Notification has **Accept** and **Decline** buttons inline (no separate accept page needed)

### Accept path

- [ ] Charlie clicks **Accept** → joins Alpha Project → bell notification is marked read
- [ ] Charlie's project picker now includes "Alpha Project"
- [ ] Back in Admin's browser: Charlie's row in **Settings → Team** is now a regular member row (Pending badge gone)

### Decline path

- [ ] Invite a second test user (or re-invite Charlie after removing them)
- [ ] Invited user clicks **Decline** → notification is dismissed
- [ ] Invited user does NOT appear in the project
- [ ] Admin's Members list no longer shows the Pending row for them

### Opt-out preference

- [ ] As Charlie: open account dropdown → **Privacy** → toggle **Allow project invitations** off → Save
- [ ] As Admin: type `charlie` in the search → Charlie appears greyed-out with "Not accepting invitations" and the Invite button is disabled
- [ ] Toggle Charlie's preference back on → Charlie is invitable again

### Other Team tab checks

- [ ] "Make co-owner" button visible for owner; sets co-owner badge on the member row
- [ ] "Remove member" button removes the member immediately
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

**After deleting Alice's account, verify data residue (log in as Admin):**

```bash
# Confirm Alice is gone from user list
curl -s -b cookies.txt $BASE/api/admin/users | jq '[.[] | select(.username=="alice")]'

# Check a task Alice owned - ownerId should now be null, task should still exist
curl -s -b cookies.txt $BASE/api/tasks/<alice-task-id> | jq '{name,ownerId,reviewerId}'

# Check announcements panel - any Alice authored should show "Deleted user", not error
```

- [ ] Alice no longer appears in admin user list
- [ ] Tasks Alice owned still exist in Alpha Project - `ownerId` is `null` (unassigned), not deleted
- [ ] Tasks Alice was reviewer on still exist - `reviewerId` is `null`
- [ ] Messages Alice sent in task chats are **deleted** (gone from the thread)
- [ ] Announcements Alice authored survive and display as "Deleted user"
- [ ] Alice's team memberships are removed - she no longer appears in Alpha Team
- [ ] Session cookie is invalidated - Alice cannot call any API endpoint after deletion

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
