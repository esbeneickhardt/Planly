# Planly QA & Polish Plan

Work through each milestone in order. When you find a bug, note it in the **Bug log** at the bottom.

---

## Milestone 0 — Prerequisites (do this first)

### Step 1 — Admin env var (server config, before first login)
- [ ] Edit `docker-compose.yml` → add `ADMIN_EMAIL: your@email.com` under the backend environment section
- [ ] Restart backend: `docker compose up -d backend`

### Step 2 — Register as admin
- [ ] Open Planly → register a new account using **exactly** the email set in `ADMIN_EMAIL`
- [ ] Account is created normally — no special flow needed
- [ ] `🛡️ Admin` link appears in the sidebar
- [ ] Open Admin panel → your account shows 👑 badge (server owner)

### Step 3 — Gmail SMTP setup (requires being logged in)
- [ ] Go to myaccount.google.com → Security → 2-Step Verification → enable
- [ ] Go to Security → App passwords → generate one for "Planly" → copy the 16-char code
- [ ] Create a product (needed to access Settings)
- [ ] Open Settings → Email → fill in:
  - Host: `smtp.gmail.com`
  - Port: `587`, SSL off
  - Username: your Gmail address
  - Password: the 16-character app password
  - From: `Planly <youraddress@gmail.com>`
- [ ] Click **Save configuration**
- [ ] Click **Send test email** → email arrives in inbox
- [ ] Status banner shows "Email is active"

---

## Milestone 1 — Auth & Onboarding

### Registration
- [ ] Register a new account — form validation works (empty fields, bad email)
- [ ] Duplicate email gives a clear error
- [ ] Duplicate username gives a clear error
- [ ] Successful register redirects to the app

### Login
- [ ] Log in with email
- [ ] Log in with username
- [ ] Wrong password gives a clear error
- [ ] Log out → redirected to login page
- [ ] Log back in → lands on Kanban

### Forgot password
- [ ] Click "Forgot password?" on login page
- [ ] Enter email → success message shown
- [ ] Email arrives in inbox
- [ ] Click reset link → lands on reset page
- [ ] Set new password → redirected to login
- [ ] Log in with new password → works
- [ ] Old password no longer works

### Onboarding modal
- [ ] First login (no products) → "The Planly way of working" modal appears
- [ ] Page 1 (The flow) — three phase cards shown, connector line visible
- [ ] Page 2 (Key concepts) — four concept cards shown
- [ ] Page 3 (How we work) — eight principles shown in 2-column grid
- [ ] Dot indicators at bottom are clickable
- [ ] ← → arrow keys navigate between pages
- [ ] "Get started →" on last page closes the modal
- [ ] Escape key closes the modal
- [ ] Clicking the backdrop closes the modal
- [ ] Re-trigger: open console → `localStorage.removeItem('planly_seen_welcome_v1')` → refresh → modal reappears

### SSO (skip if not configured)
- [ ] SSO button only appears on login page when OIDC env vars are set
- [ ] SSO flow completes and lands on Kanban

---

## Milestone 2 — Admin Panel

### Basic access
- [ ] Non-admin users do NOT see the 🛡️ Admin link in the sidebar
- [ ] Navigating to `/admin` as a non-admin shows "Access denied"
- [ ] Admin user sees the 🛡️ Admin link in the sidebar
- [ ] Admin panel loads with Users / Email Whitelist / Audit Log tabs

### Users tab
- [ ] All registered users listed with email and join date
- [ ] Founding admin shown with 👑 badge
- [ ] "Email verified" / "Unverified" badge shown per user
- [ ] Founding admin can promote a regular user to admin → they appear with Admin badge
- [ ] Founding admin can demote a regular admin → badge removed
- [ ] Cannot demote the last admin (clear error message)
- [ ] Cannot demote the founding admin (clear error message)
- [ ] Founding admin can force-verify an unverified user's email

### Crown transfer
- [ ] "Transfer server ownership" button visible only to founding admin
- [ ] Select another admin from the dropdown → click Transfer → confirm dialog
- [ ] After transfer: new user has 👑, old user loses it but retains Admin badge
- [ ] New founding admin can now use all founding-admin-only actions

### Email whitelist tab
- [ ] Add a domain pattern (`@company.com`) → appears in list
- [ ] Add an exact address (`user@example.com`) → appears in list
- [ ] Remove an entry → removed from list
- [ ] Invalid pattern (no @ prefix and not a full email) → error shown

### Audit log tab
- [ ] Registration events appear (USER_REGISTERED)
- [ ] Login events appear (LOGIN)
- [ ] Failed login events appear (LOGIN_FAILED)
- [ ] Admin actions appear (USER_PROMOTED, USER_DEMOTED, CROWN_TRANSFERRED)
- [ ] "Load more" loads older events

### Email verification enforcement (requires `REQUIRE_EMAIL_VERIFICATION=true`)
- [ ] New user registers → receives verification email
- [ ] Trying to log in before verifying → clear "verify your email" error
- [ ] Click verify link in email → success page
- [ ] Log in after verification → works

### Whitelist enforcement (requires `REQUIRE_WHITELIST=true`)
- [ ] Register with an email NOT on the whitelist → clear error message
- [ ] Register with an email ON the whitelist → succeeds
- [ ] ADMIN_EMAIL is always allowed regardless of whitelist

---

## Milestone 3 — Products & Teams

### Creating products
- [ ] Create a product (name, emoji, description, deadline)
- [ ] Product appears in sidebar
- [ ] Create a second product — both appear, switching works
- [ ] Active product name shown in top bar

### Editing products
- [ ] Edit product name → updates in sidebar and top bar
- [ ] Edit emoji → updates in sidebar
- [ ] Edit description and deadline → saves correctly

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

### Memberships modal (from top bar / account menu)
- [ ] All products listed with correct role badge
- [ ] "Leave" button shown for non-owners
- [ ] Clicking "Leave" as non-owner → confirm → user removed from product
- [ ] Clicking "Leave" as owner → dialog offers Transfer or Delete
- [ ] Transfer ownership → select member → confirm → new owner shown
- [ ] Delete project from ownership dialog → product removed everywhere

---

## Milestone 4 — Kanban Board

### Columns
- [ ] Create a new column
- [ ] Rename a column
- [ ] Delete a column — tasks in it move to the first column (backlog)
- [ ] Drag columns to reorder
- [ ] Column order persists after page refresh

### Tasks
- [ ] Create a task from the board (+ button / new task modal)
- [ ] Task appears in the correct column
- [ ] Drag a task to a different column → status updates
- [ ] Drag tasks to reorder within a column
- [ ] Drag order persists after page refresh

### Per-column sort
- [ ] Click ⇅ on a column → cycle through sort modes (Custom, Deadline, etc.)
- [ ] Sort mode label shown in column header
- [ ] Deadline sort: tasks with deadline sorted correctly, no-deadline tasks last
- [ ] "Reset" returns to custom drag order

### Filters
- [ ] Filter by owner → only that person's tasks shown
- [ ] Filter by multiple owners
- [ ] Filter by color dot
- [ ] Filter by sprint
- [ ] Task count updates to reflect filtered number
- [ ] "↺ Reset" clears all filters

### Compact view
- [ ] Toggle "☰ Compact" → table view renders
- [ ] All filtered tasks appear as rows
- [ ] Status dropdown per row → change status → task moves on board view
- [ ] Sort by Status, Task, Owner, Deadline column headers
- [ ] Click a row → task detail panel opens
- [ ] Toggle "▦ Board" → returns to normal board
- [ ] Preference persists across page refresh

---

## Milestone 5 — Task Detail Panel

### Opening
- [ ] Click a Kanban card → detail panel slides in
- [ ] Click a row in compact view → detail panel opens
- [ ] "Open task →" in chat → detail panel opens

### Editing
- [ ] Edit task name → saved on blur/submit
- [ ] Edit description → markdown rendered in preview
- [ ] Assign an owner → avatar shown on card
- [ ] Set a deadline → shown on card
- [ ] Set a color category → dot shown on card
- [ ] Change status via dropdown in panel

### Subtasks
- [ ] Add a subtask
- [ ] Check a subtask complete → strikethrough, completedAt recorded
- [ ] Reorder subtasks by drag
- [ ] Delete a subtask
- [ ] Subtask progress count shown on card (e.g. 2/3)

### Closing & deleting
- [ ] Close panel → changes saved
- [ ] Make unsaved change → try to close → "unsaved changes" prompt appears
- [ ] Delete task → removed from board, panel closes

---

## Milestone 6 — Canvas (Plan view)

### Creating & moving
- [ ] Double-click canvas → creates a new task
- [ ] Drag a task node to move it
- [ ] Position persists after page refresh

### Dependencies
- [ ] Draw an arrow from task A to task B (A must finish before B)
- [ ] Arrow appears on canvas
- [ ] Delete an arrow
- [ ] Cycle detection: try to create A → B → A → error shown

### Milestones
- [ ] Tasks with a deadline show milestone badge on canvas
- [ ] Milestone tasks visually distinct from regular tasks

### Sprints on canvas
- [ ] Sprint tasks visually grouped/highlighted
- [ ] Clicking a sprint task shows sprint info

### Snapshots
- [ ] Save a named canvas snapshot
- [ ] Move tasks around
- [ ] Restore the snapshot → positions revert
- [ ] Delete a snapshot

---

## Milestone 7 — Gantt / Progress view

- [ ] All milestones for the active product appear as bars
- [ ] Bar colour reflects health: green (on track), amber (at risk), red (overdue)
- [ ] Hover over a milestone bar → popover shows task list with completion status
- [ ] Hover over the product bar (end product row) → popover shows milestone list
- [ ] Overdue milestones shown in red
- [ ] "Milestones X/Y" counter does NOT appear on Kanban, Canvas, or Backlog
- [ ] Milestones sorted correctly on the timeline

---

## Milestone 8 — Backlog

- [ ] All tasks with no sprint assignment appear in the backlog
- [ ] Tasks already in a sprint do not appear
- [ ] Create a task from the backlog
- [ ] Assign a backlog task to a sprint
- [ ] Unassigned task badge in sidebar shows correct count
- [ ] Sort and filter backlog tasks

---

## Milestone 9 — Chat & Messaging

### Product chat
- [ ] Send a message in the product-level chat
- [ ] Edit a message → shows "edited" label
- [ ] Delete a message → removed from thread
- [ ] Upload an image attachment → thumbnail shown
- [ ] Click image → lightbox opens
- [ ] Upload a non-image file (PDF, CSV) → download link shown

### Task chat
- [ ] Open a task → switch to task chat thread
- [ ] Send a message in the task thread
- [ ] Task thread messages separate from product chat

### Chat panel features
- [ ] Switch between Messages and Tasks tabs in chat panel
- [ ] Search/filter tasks in the Tasks tab
- [ ] Pin a task to the top of chat panel
- [ ] Unpin a task
- [ ] "Open task →" button fetches and opens task detail panel

### Real-time
- [ ] Open app in two browser tabs as different users
- [ ] User A sends a message → appears for User B without refresh
- [ ] User A moves a task → board updates for User B without refresh

---

## Milestone 10 — Sprints

- [ ] Create a sprint (name, start date, end date)
- [ ] Sprint appears in sprint filter dropdown on Kanban
- [ ] Edit sprint name and dates
- [ ] Add tasks to a sprint (from canvas or backlog)
- [ ] Tasks appear on Kanban when sprint is selected
- [ ] Remove a task from a sprint → disappears from sprint filter view
- [ ] Delete a sprint → tasks remain, just unassigned
- [ ] Current sprint (today falls within dates) auto-selected on page load
- [ ] "All sprints" shows all tasks regardless of sprint

---

## Milestone 11 — Settings

### Team tab
- [ ] All members listed with correct role (member / co-owner / owner)
- [ ] Pending access requests shown and actionable
- [ ] Create invite link
- [ ] Create invite with email address → email arrives

### Permissions tab
- [ ] Change a user's access level for a specific tab (e.g. Kanban → read)
- [ ] Log in as that user → they can view but not edit that tab
- [ ] Change to "none" → tab hidden for that user
- [ ] Owner and co-owners always have full write access (cannot be restricted)

### Colors tab
- [ ] Toggle a color off → no longer available on tasks
- [ ] Toggle back on → available again
- [ ] Rename a color label → name shown in task color picker

### Ownership tab
- [ ] Current owner shown correctly
- [ ] Transfer ownership to another member → badge updates

### Apps tab
- [ ] Create an app registration
- [ ] Generate a token for the app → token revealed once
- [ ] Use the token in an API call (`Authorization: Bearer planly_...`) → works
- [ ] Revoke a token → API call returns 401
- [ ] Delete an app registration

### Webhooks tab
- [ ] Create a webhook with a URL and event type
- [ ] Trigger the event (e.g. create a task) → delivery log shows attempt
- [ ] Delivery shows status code and response body
- [ ] Deactivate a webhook → events no longer sent
- [ ] Delete a webhook

### Email tab
- [ ] SMTP form pre-filled with saved values
- [ ] Change a setting, save → banner updates
- [ ] Send test email → arrives in inbox
- [ ] Clear saved config → reverts to env vars (or shows not configured)

### Danger Zone tab
- [ ] Non-owner sees "Leave project" option
- [ ] Owner sees "Delete project" option in red
- [ ] Delete project → confirm dialog → product removed, redirected away

---

## Milestone 12 — Integrations & Account

- [ ] Open Integrations modal (from account menu or top bar)
- [ ] "Access Tokens" tab: create a PAT, name it, set expiry
- [ ] Token value shown once → copy it
- [ ] Use PAT in a curl request → `GET /api/products` returns data
- [ ] Revoke PAT → same curl returns 401
- [ ] "My Permissions" tab shows all projects user belongs to
- [ ] Role shown correctly (owner / co_owner / member) per project
- [ ] Per-tab permission levels shown
- [ ] Deleted projects do NOT appear in the list
- [ ] "API docs ↗" link opens the API reference page in a new tab

---

## Milestone 13 — Analytics

- [ ] Analytics page loads for the active product (sidebar "📊 Analytics")
- [ ] Summary cards show correct counts (active tasks, completed, cycle time, total)
- [ ] Bar chart shows tasks completed per day
- [ ] Period toggle: 7d / 30d / 90d — chart updates correctly
- [ ] 90d view shows weekly buckets
- [ ] Hover over a bar → tooltip shows task count
- [ ] Top contributors list is correct
- [ ] Contributor bar widths are proportional
- [ ] Event log shows recent activity with real usernames (not IDs)
- [ ] "Load more" loads older events correctly
- [ ] Switching products reloads all data for the new product

---

## Milestone 14 — Notifications

- [ ] Assign a task to another user → they receive a notification
- [ ] Notification bell shows unread badge count
- [ ] Click bell → notification list opens
- [ ] Click a notification → navigates to the relevant task/product
- [ ] Notification marked as read after clicking
- [ ] "Mark all read" clears the badge

---

## Milestone 15 — Search

- [ ] Open global search (keyboard shortcut or sidebar button)
- [ ] Type a task name → matching tasks appear
- [ ] Type a message snippet → matching messages appear
- [ ] Click a task result → navigates to that task on the board
- [ ] Click a message result → navigates to that chat thread
- [ ] Search scoped to active product vs. all products (if applicable)
- [ ] Escape key closes search modal

---

## Milestone 16 — Account & Profile

- [ ] Open account/profile settings
- [ ] Edit display name (real name)
- [ ] Edit username → updated in chat and task cards
- [ ] Change avatar emoji → shown in sidebar and task cards
- [ ] Upload a profile photo → displayed instead of emoji
- [ ] Change password (email/password accounts only)
- [ ] SSO accounts cannot set a password

---

## Milestone 17 — Export

- [ ] Export a product's data from Settings or via API
- [ ] Download contains tasks with all fields
- [ ] Download contains milestones, columns, sprints
- [ ] File opens correctly (CSV or JSON format)

---

## Milestone 18 — Cross-cutting & Polish

- [ ] Dark / light theme toggle works
- [ ] Theme persists across page refresh
- [ ] Sidebar collapses → icons only shown
- [ ] Sidebar expands → labels return
- [ ] Switching products resets board, canvas, and gantt views correctly
- [ ] All modals close on Escape
- [ ] All modals close on backdrop click
- [ ] No JavaScript console errors during normal use
- [ ] App usable on a narrow browser window (1024px) — no broken layouts
- [ ] Long task names truncate cleanly, don't break layout
- [ ] Empty states shown when no tasks / no products / no members

---

## Bug log

> Add bugs here as you find them during testing.

- [ ] 
