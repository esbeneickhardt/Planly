# Planly QA Plan

Work through each milestone in order. Check off items as you verify them. Add bugs to the **Bug log** at the bottom.

---

## Milestone 0 — Prerequisites

### Step 1 — Configure admin email (before first login)
- [X] Edit `docker-compose.yml` → set `ADMIN_EMAIL: your@email.com` under backend environment
- [X] Restart backend: `docker compose up -d backend`
- [X] Check logs: `docker compose logs backend | grep '\[admin\]'` — look for the temporary password line

### Step 2 — First login as admin
- [X] Log in with `ADMIN_EMAIL` and the temporary password from the logs
- [X] Admin shield button `🛡` appears in the top-right bar (next to `?`, bell)
- [X] You are immediately prompted to change your password — do so

### Step 3 — Enter admin mode
- [X] Click the shield button → center nav switches to 6 admin tabs (Ownership, Users, Projects, Email, Audit Logs, Stats)
- [X] Project dropdown shows "Admin" label
- [X] Opening the project dropdown shows "Select a project to leave admin mode"
- [X] Clicking a project in the dropdown exits admin mode and navigates to Kanban

### Step 4 — Gmail SMTP setup
- [X] Go to myaccount.google.com → Security → 2-Step Verification → enable
- [X] Security → App passwords → generate one for "Planly" → copy the 16-char code
- [X] In Admin → Email Settings → fill in:
  - Host: `smtp.gmail.com`, Port: `587`, SSL off
  - Username: your Gmail address
  - Password: the 16-character app password
  - From: `Planly <youraddress@gmail.com>`
- [X] Click **Save configuration** → status banner shows "Email is active"
- [X] Click **Send test email** → email arrives in inbox

---

## Milestone 1 — Auth & Onboarding

### Registration
- [X] Register a new account — form validation works (empty fields, bad email, short password)
- [X] Duplicate email gives a clear error
- [X] Duplicate username gives a clear error
- [X] Successful registration redirects to the app

### Login
- [X] Log in with email
- [X] Log in with username
- [X] Wrong password gives a clear error
- [X] Log out → redirected to login page
- [X] Log back in → lands on Kanban (or `/admin` if admin with no projects)

### Login lockout
- [X] Enter wrong password 4 times → each error shows remaining attempts (e.g. "1 attempt remaining before lockout")
- [X] 5th wrong attempt → "Account locked for 15 minutes" message; HTTP 429
- [X] Trying again while locked → shows "Try again in X minutes"
- [X] Admin panel → Users tab → locked user shows "Locked Xm" badge in the Login column
- [X] Click "Unlock" next to the locked user → badge disappears
- [X] After unlocking, user can log in with correct password immediately
- [X] Correct password after failed attempts (but before lockout) → counter resets; subsequent failures start fresh from 1

### Forgot password
- [X] Click "Forgot password?" on login page
- [X] Enter email → success message shown
- [X] Email arrives in inbox
- [X] Click reset link → lands on reset page
- [X] Set new password → redirected to login
- [X] Log in with new password → works
- [X] Old password no longer works

### Onboarding modal
- [X] First login with no projects → "The Planly way of working" modal appears
- [X] Page 1, 2, 3 display correctly; dot indicators and arrow keys navigate
- [X] "Get started →" on last page closes the modal
- [X] Escape and backdrop click both close the modal
- [X] Re-trigger: `localStorage.removeItem('planly_seen_welcome_v1')` → refresh → modal reappears

### SSO (skip if not configured)
- [ ] SSO button only appears when OIDC env vars are set
- [ ] SSO flow completes and lands on Kanban

---

## Milestone 2 — Admin Panel

### Access control
- [X] Non-admin users do NOT see the shield button in the top bar
- [X] Navigating to `/admin` as a non-admin silently redirects to `/kanban`
- [X] Admin user sees the shield button in the top bar

### Admin mode UX
- [X] Shield button highlighted (brand colour, ring) when on `/admin`; neutral when not
- [X] Clicking shield when NOT on `/admin` → navigates to `/admin`, center nav shows admin tabs
- [X] Clicking shield when ON `/admin` → exits to `/kanban`
- [X] Admin tabs: Ownership, Users, Projects, Email, Audit Logs, Stats — all load without error
- [X] URL search param `?tab=ownership` etc. drives the active tab

### Ownership tab
- [X] Shows the founding admin (👑 badge) and all current admins
- [X] "Transfer server ownership" section visible only to founding admin
- [X] Select another admin from the dropdown → click Transfer → confirm
- [X] After transfer: new user has 👑, old user retains Admin badge but not 👑
- [X] New founding admin can use founding-admin-only actions; old one cannot
- [X] Restart the backend → ownership is preserved; `ADMIN_EMAIL` account stays admin but does NOT reclaim 👑

### Users tab
- [X] All registered users listed with email, join date, verification status
- [X] Founding admin shows 👑, other admins show Admin badge
- [X] Promote a regular user to admin → Admin badge appears
- [X] Demote a regular admin → badge removed
- [X] Cannot demote the last admin — clear error
- [X] Cannot demote the founding admin — clear error
- [X] Force-verify an unverified user's email → badge updates
- [X] Founding admin can delete a non-founding user → user removed from list
- [X] Cannot delete yourself — clear error

### Projects tab
- [X] All server projects listed with owner, member count, task count
- [X] Shows creation date and deadline (if set)

### Email Settings tab
- [X] SMTP status banner: "Email is active" (green) or "Email not configured" (amber)
- [X] SMTP form pre-filled with saved values; password field blank (masked)
- [X] Save config → status updates
- [X] Send test email → arrives in inbox
- [X] Clear saved config → reverts to env-var fallback (or shows not configured)
- [X] "Require email verification" toggle only visible when email IS configured
- [X] Turning on email verification:
  - [X] Sends a verification email to every user whose email has never been verified (`emailVerified = false`)
  - [X] Already-verified users are unaffected — they keep access
  - [X] Toast shows how many emails were sent (or "all existing users already verified")
  - [X] If the admin's own email is unverified, the amber prompt appears: "Verify your email first — we sent a link to [email]"
  - [X] Any user who is logged in but unverified is kicked out on their next action
- [X] Turning off email verification → unverified users can log in again immediately
- [X] Re-enabling after some users have verified → only the still-unverified users receive a new email; previously verified users are untouched
- [X] "Enforce email whitelist" toggle visible regardless of email status
- [X] Email allowlist section only appears when whitelist is enabled
- [X] Add a domain (`@company.com`) → appears in list
- [X] Add an exact address → appears in list
- [X] Remove an entry → removed
- [X] Invalid pattern → clear error

### Audit Logs tab
- [X] Log entries shown newest first
- [X] Action badge coloured: red for FAIL/DELETE/PRUNE, purple for others
- [X] Actor and target names shown
- [X] Filter by action type → list updates
- [X] Filter by date range (From / To) → list updates
- [X] Apply and Reset buttons work correctly
- [X] "Load more" loads next page without resetting filters
- [X] **Export CSV** button → downloads a `.csv` file with all matching rows
- [X] **Export JSONL** button → downloads a `.jsonl` file
- [X] Export respects active filters (action, date range)
- [X] Prune section visible only to founding admin
- [X] Enter days, click Prune → confirm step appears
- [X] Confirm → old entries deleted; new LOGS_PRUNED entry appears at top
- [X] Cancel → nothing deleted

### Statistics tab
- [X] Total users, projects, tasks, messages counts shown
- [X] "+N last 30 days" sub-labels shown for users and projects
- [X] Admin count and unverified user count correct

### Admin API access (for deployers)
- [ ] Create an API token in Settings → Apps
- [ ] Call `GET /api/admin/logs/export?format=jsonl` with `Authorization: Bearer <token>` → streams JSONL
- [ ] Call with date filters (`&from=2026-01-01&to=2026-06-30`) → filtered export
- [ ] Call `DELETE /api/admin/logs/prune` with token → returns 403 unless founding admin token

---

## Milestone 3 — Email Verification Enforcement

> Requires email to be configured and "Require email verification" turned on in Admin → Email Settings.

- [X] New user registers → receives verification email immediately
- [X] Trying to log in before verifying → clear "verify your email" error message
- [X] Login page shows **"Resend verification email"** link when login is blocked; clicking it sends a new link (enter email address in the identifier field first)
- [X] Logged-in unverified user is automatically signed out on their next action
- [X] Click verify link in email → lands on verification success page
- [X] Log in after verification → works
- [X] Users who were already verified before the toggle was turned on are unaffected throughout

---

## Milestone 4 — Whitelist Enforcement

> Requires "Enforce email whitelist" turned on and at least one pattern added.

- [X] Register with an email NOT on the whitelist → clear error
- [X] Register with an email ON the whitelist → succeeds
- [X] ADMIN_EMAIL is always allowed regardless of whitelist

---

## Milestone 5 — Products & Teams

### Creating products
- [X] Create a product (name, emoji, description, deadline)
- [X] Product appears in the project picker dropdown
- [X] Create a second product — both appear, switching works
- [X] Active product shown in the project picker button

### Editing products
- [X] Edit product name → updates in project picker
- [X] Edit emoji, description, deadline → saves correctly

### Inviting members
- [X] Invite by link → copy link → open in incognito → new user can register and join
- [X] Invite by email → email arrives → link works → new user joins team
- [X] Invited user appears in Settings → Team

### Member management
- [X] Remove a team member → they lose access
- [X] Promote a member to co-owner → they can manage settings
- [X] Demote co-owner back to member

### Access requests
- [X] Non-member visits a product link and requests access
- [X] Owner sees the request in Settings → Team
- [X] Owner approves → user gets access
- [X] Owner rejects → user sees rejection

### Memberships modal
- [X] All products listed with correct role badge
- [X] "Leave" button shown for non-owners
- [X] Clicking "Leave" as non-owner → confirm → user removed
- [X] Clicking "Leave" as owner → dialog offers Transfer or Delete
- [X] Transfer ownership → select member → confirm → new owner shown
- [X] Delete project from ownership dialog → product removed everywhere

---

## Milestone 6 — Kanban Board

### Columns
- [X] Create, rename, delete a column
- [X] Drag columns to reorder — order persists after refresh
- [X] Deleting a column moves tasks to the first column

### Tasks
- [X] Create a task (+ button / new task modal)
- [X] Drag task to different column → status updates
- [X] Drag tasks to reorder within a column — persists after refresh

### Per-column sort
- [X] Click ⇅ → cycle through sort modes (Custom, Deadline, etc.)
- [X] Deadline sort: tasks with deadline sorted correctly, no-deadline last
- [X] "Reset" returns to custom drag order

### Filters
- [X] Filter by owner, colour dot, sprint — task count updates
- [X] Multiple filters work together
- [X] "↺ Reset" clears all filters

### Compact view
- [X] Toggle "☰ Compact" → table view renders
- [X] Status dropdown per row → change status → moves on board view
- [X] Sort by column headers; click row → task detail panel opens
- [X] Toggle "▦ Board" → returns to board; preference persists across refresh

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
