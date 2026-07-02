# Planly QA Plan

Work through each milestone in order. Check off items as you verify them. Add bugs to the **Bug log** at the bottom.

---

## Milestone 0 — Prerequisites

### Step 1 — Configure admin email (before first login)
- [ ] Edit `docker-compose.yml` → set `ADMIN_EMAIL: your@email.com` under backend environment
- [ ] Restart backend: `docker compose up -d backend`
- [ ] Check logs: `docker compose logs backend` — look for the ╔══╗ box with a temporary password

### Step 2 — First login as admin
- [ ] Log in with `ADMIN_EMAIL` and the temporary password from the logs
- [ ] Admin shield button `🛡` appears in the top-right bar (next to `?`, bell)
- [ ] You are immediately prompted to change your password — do so

### Step 3 — Enter admin mode
- [ ] Click the shield button → center nav switches to 6 admin tabs (Ownership, Users, Projects, Email, Audit Logs, Stats)
- [ ] Project dropdown shows "Admin" label
- [ ] Opening the project dropdown shows "Select a project to leave admin mode"
- [ ] Clicking a project in the dropdown exits admin mode and navigates to Kanban

### Step 4 — Gmail SMTP setup
- [ ] Go to myaccount.google.com → Security → 2-Step Verification → enable
- [ ] Security → App passwords → generate one for "Planly" → copy the 16-char code
- [ ] In Admin → Email Settings → fill in:
  - Host: `smtp.gmail.com`, Port: `587`, SSL off
  - Username: your Gmail address
  - Password: the 16-character app password
  - From: `Planly <youraddress@gmail.com>`
- [ ] Click **Save configuration** → status banner shows "Email is active"
- [ ] Click **Send test email** → email arrives in inbox

---

## Milestone 1 — Auth & Onboarding

### Registration
- [ ] Register a new account — form validation works (empty fields, bad email, short password)
- [ ] Duplicate email gives a clear error
- [ ] Duplicate username gives a clear error
- [ ] Successful registration redirects to the app

### Login
- [ ] Log in with email
- [ ] Log in with username
- [ ] Wrong password gives a clear error
- [ ] Log out → redirected to login page
- [ ] Log back in → lands on Kanban (or `/admin` if admin with no projects)

### Forgot password
- [ ] Click "Forgot password?" on login page
- [ ] Enter email → success message shown
- [ ] Email arrives in inbox
- [ ] Click reset link → lands on reset page
- [ ] Set new password → redirected to login
- [ ] Log in with new password → works
- [ ] Old password no longer works

### Onboarding modal
- [ ] First login with no projects → "The Planly way of working" modal appears
- [ ] Page 1, 2, 3 display correctly; dot indicators and arrow keys navigate
- [ ] "Get started →" on last page closes the modal
- [ ] Escape and backdrop click both close the modal
- [ ] Re-trigger: `localStorage.removeItem('planly_seen_welcome_v1')` → refresh → modal reappears

### SSO (skip if not configured)
- [ ] SSO button only appears when OIDC env vars are set
- [ ] SSO flow completes and lands on Kanban

---

## Milestone 2 — Admin Panel

### Access control
- [ ] Non-admin users do NOT see the shield button in the top bar
- [ ] Navigating to `/admin` as a non-admin shows "Access denied"
- [ ] Admin user sees the shield button in the top bar

### Admin mode UX
- [ ] Shield button highlighted (brand colour, ring) when on `/admin`; neutral when not
- [ ] Clicking shield when NOT on `/admin` → navigates to `/admin`, center nav shows admin tabs
- [ ] Clicking shield when ON `/admin` → exits to `/kanban`
- [ ] Admin tabs: Ownership, Users, Projects, Email, Audit Logs, Stats — all load without error
- [ ] URL search param `?tab=ownership` etc. drives the active tab

### Ownership tab
- [ ] Shows the founding admin (👑 badge) and all current admins
- [ ] "Transfer server ownership" section visible only to founding admin
- [ ] Select another admin from the dropdown → click Transfer → confirm
- [ ] After transfer: new user has 👑, old user retains Admin badge
- [ ] New founding admin can use founding-admin-only actions; old one cannot

### Users tab
- [ ] All registered users listed with email, join date, verification status
- [ ] Founding admin shows 👑, other admins show Admin badge
- [ ] Promote a regular user to admin → Admin badge appears
- [ ] Demote a regular admin → badge removed
- [ ] Cannot demote the last admin — clear error
- [ ] Cannot demote the founding admin — clear error
- [ ] Force-verify an unverified user's email → badge updates
- [ ] Founding admin can delete a non-founding user → user removed from list
- [ ] Cannot delete yourself — clear error

### Projects tab
- [ ] All server projects listed with owner, member count, task count
- [ ] Shows creation date and deadline (if set)

### Email Settings tab
- [ ] SMTP status banner: "Email is active" (green) or "Email not configured" (amber)
- [ ] SMTP form pre-filled with saved values; password field blank (masked)
- [ ] Save config → status updates
- [ ] Send test email → arrives in inbox
- [ ] Clear saved config → reverts to env-var fallback (or shows not configured)
- [ ] "Require email verification" toggle only visible when email IS configured
- [ ] Turning on email verification when admin's own email is unverified:
  - [ ] Does NOT enable the setting
  - [ ] Sends a verification email to the admin
  - [ ] Shows inline warning: "Verify your email first — we sent a link to [email]"
  - [ ] After admin verifies and returns, enabling the toggle works
- [ ] "Enforce email whitelist" toggle visible regardless of email status
- [ ] Email allowlist section only appears when whitelist is enabled
- [ ] Add a domain (`@company.com`) → appears in list
- [ ] Add an exact address → appears in list
- [ ] Remove an entry → removed
- [ ] Invalid pattern → clear error

### Audit Logs tab
- [ ] Log entries shown newest first
- [ ] Action badge coloured: red for FAIL/DELETE/PRUNE, purple for others
- [ ] Actor and target names shown
- [ ] Filter by action type → list updates
- [ ] Filter by date range (From / To) → list updates
- [ ] Apply and Reset buttons work correctly
- [ ] "Load more" loads next page without resetting filters
- [ ] **Export CSV** button → downloads a `.csv` file with all matching rows
- [ ] **Export JSONL** button → downloads a `.jsonl` file
- [ ] Export respects active filters (action, date range)
- [ ] Prune section visible only to founding admin
- [ ] Enter days, click Prune → confirm step appears
- [ ] Confirm → old entries deleted; new LOGS_PRUNED entry appears at top
- [ ] Cancel → nothing deleted

### Statistics tab
- [ ] Total users, projects, tasks, messages counts shown
- [ ] "+N last 30 days" sub-labels shown for users and projects
- [ ] Admin count and unverified user count correct

### Admin API access (for deployers)
- [ ] Create an API token in Settings → Apps
- [ ] Call `GET /api/admin/logs/export?format=jsonl` with `Authorization: Bearer <token>` → streams JSONL
- [ ] Call with date filters (`&from=2026-01-01&to=2026-06-30`) → filtered export
- [ ] Call `DELETE /api/admin/logs/prune` with token → returns 403 unless founding admin token

---

## Milestone 3 — Email Verification Enforcement

> Requires email to be configured and "Require email verification" turned on in Admin → Email Settings.

- [ ] New user registers → receives verification email
- [ ] Trying to log in before verifying → clear "verify your email" error
- [ ] Click verify link in email → success
- [ ] Log in after verification → works

---

## Milestone 4 — Whitelist Enforcement

> Requires "Enforce email whitelist" turned on and at least one pattern added.

- [ ] Register with an email NOT on the whitelist → clear error
- [ ] Register with an email ON the whitelist → succeeds
- [ ] ADMIN_EMAIL is always allowed regardless of whitelist

---

## Milestone 5 — Products & Teams

### Creating products
- [ ] Create a product (name, emoji, description, deadline)
- [ ] Product appears in the project picker dropdown
- [ ] Create a second product — both appear, switching works
- [ ] Active product shown in the project picker button

### Editing products
- [ ] Edit product name → updates in project picker
- [ ] Edit emoji, description, deadline → saves correctly

### Inviting members
- [ ] Invite by link → copy link → open in incognito → new user can register and join
- [ ] Invite by email → email arrives → link works → new user joins team
- [ ] Invited user appears in Settings → Team

### Member management
- [ ] Remove a team member → they lose access
- [ ] Promote a member to co-owner → they can manage settings
- [ ] Demote co-owner back to member

### Access requests
- [ ] Non-member visits a product link and requests access
- [ ] Owner sees the request in Settings → Team
- [ ] Owner approves → user gets access
- [ ] Owner rejects → user sees rejection

### Memberships modal
- [ ] All products listed with correct role badge
- [ ] "Leave" button shown for non-owners
- [ ] Clicking "Leave" as non-owner → confirm → user removed
- [ ] Clicking "Leave" as owner → dialog offers Transfer or Delete
- [ ] Transfer ownership → select member → confirm → new owner shown
- [ ] Delete project from ownership dialog → product removed everywhere

---

## Milestone 6 — Kanban Board

### Columns
- [ ] Create, rename, delete a column
- [ ] Drag columns to reorder — order persists after refresh
- [ ] Deleting a column moves tasks to the first column

### Tasks
- [ ] Create a task (+ button / new task modal)
- [ ] Drag task to different column → status updates
- [ ] Drag tasks to reorder within a column — persists after refresh

### Per-column sort
- [ ] Click ⇅ → cycle through sort modes (Custom, Deadline, etc.)
- [ ] Deadline sort: tasks with deadline sorted correctly, no-deadline last
- [ ] "Reset" returns to custom drag order

### Filters
- [ ] Filter by owner, colour dot, sprint — task count updates
- [ ] Multiple filters work together
- [ ] "↺ Reset" clears all filters

### Compact view
- [ ] Toggle "☰ Compact" → table view renders
- [ ] Status dropdown per row → change status → moves on board view
- [ ] Sort by column headers; click row → task detail panel opens
- [ ] Toggle "▦ Board" → returns to board; preference persists across refresh

---

## Milestone 7 — Task Detail Panel

- [ ] Click a Kanban card → detail panel slides in
- [ ] Edit name, description, owner, deadline, colour, status — all save
- [ ] Add, check, reorder, delete subtasks; progress count shown on card
- [ ] Unsaved change → close → "unsaved changes" prompt
- [ ] Delete task → removed from board, panel closes

---

## Milestone 8 — Canvas (Plan view)

- [ ] Double-click canvas → creates a new task node
- [ ] Drag to move; position persists after refresh
- [ ] Draw dependency arrow A → B; delete arrow
- [ ] Cycle detection: A → B → A → error shown
- [ ] Tasks with deadline show milestone badge
- [ ] Save/restore/delete named canvas snapshots

---

## Milestone 9 — Gantt / Progress view

- [ ] Milestones appear as bars; colour reflects health (green / amber / red)
- [ ] Hover bar → popover with task list
- [ ] Overdue milestones shown in red
- [ ] "Milestones X/Y" counter NOT shown on other views

---

## Milestone 10 — Backlog

- [ ] Tasks with no sprint appear; sprinted tasks do not
- [ ] Create task from backlog; assign to sprint
- [ ] Unassigned badge count in sidebar is correct

---

## Milestone 11 — Chat & Messaging

- [ ] Send, edit, delete messages in product chat
- [ ] Upload image → thumbnail; upload file → download link
- [ ] Task chat thread separate from product chat
- [ ] Switch Messages / Tasks tabs in chat panel; pin and unpin tasks
- [ ] Real-time: two tabs → message/task update appears without refresh

---

## Milestone 12 — Sprints

- [ ] Create sprint (name, start, end dates)
- [ ] Sprint filter on Kanban works; edit sprint name/dates
- [ ] Add / remove tasks from sprint; delete sprint → tasks remain unassigned
- [ ] Current sprint auto-selected on load

---

## Milestone 13 — Settings

### Team, Permissions, Colors, Ownership tabs
- [ ] Members listed with correct roles; pending requests actionable
- [ ] Permission changes take effect for the affected user (read-only tab, hidden tab)
- [ ] Toggle / rename colours; transfer project ownership

### Apps tab
- [ ] Create app, generate token → shown once
- [ ] Use token in API call → works; revoke → 401
- [ ] Delete app registration

### Webhooks tab
- [ ] Create webhook → trigger event → delivery log shows attempt with status code
- [ ] Deactivate → events stop; delete webhook

### Danger Zone tab
- [ ] Non-owner: "Leave project"; Owner: "Delete project" (red)
- [ ] Delete project → confirm dialog → removed, redirected away

---

## Milestone 14 — Integrations & Account

- [ ] Create PAT, name it, set expiry → token shown once
- [ ] Use PAT in curl → data returned; revoke → 401
- [ ] "My Permissions" tab shows all projects with correct roles and per-tab levels
- [ ] Deleted projects do NOT appear

---

## Milestone 15 — Analytics

- [ ] Summary cards correct (active tasks, completed, cycle time, total)
- [ ] Bar chart with period toggle 7d / 30d / 90d (90d = weekly buckets)
- [ ] Hover bar → tooltip; top contributors list with proportional bars
- [ ] Event log with real usernames; "Load more" works
- [ ] Switching products reloads all data

---

## Milestone 16 — Notifications

- [ ] Assign task to another user → they get a notification
- [ ] Bell shows unread badge; click → list; click notification → navigates to task
- [ ] Notification marked read; "Mark all read" clears badge

---

## Milestone 17 — Search

- [ ] Open global search (Ctrl/Cmd+K or search button)
- [ ] Type task name → results; type message snippet → results
- [ ] Click result → navigates correctly; Escape closes

---

## Milestone 18 — Account & Profile

- [ ] Edit display name, username, avatar emoji; upload profile photo
- [ ] Change password (email/password accounts); SSO accounts cannot set a password

---

## Milestone 19 — Export

- [ ] Export product data → download contains tasks, milestones, columns, sprints

---

## Milestone 20 — Cross-cutting & Polish

- [ ] Dark / light theme toggle; persists across refresh
- [ ] Switching products resets board, canvas, and gantt correctly
- [ ] All modals close on Escape and backdrop click
- [ ] No JavaScript console errors during normal use
- [ ] App usable at 1024 px width — no broken layouts
- [ ] Long task names truncate cleanly
- [ ] Empty states shown (no tasks / no products / no members)

---

## Bug log

> Add bugs here as you find them.

- [ ] 
