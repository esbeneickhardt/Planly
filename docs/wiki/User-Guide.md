# User Guide

---

## Teams and Projects

Planly is organized around **teams** and **projects** (called "products" in the API).

- A **team** is a group of users who collaborate together. One team can own multiple projects.
- A **project** is a workspace with tasks, views, and settings. Each project lives under exactly one team.

### Creating a team

Click **New Team** in the sidebar, give it a name and optional emoji, and save. You become the co-owner.

### Inviting people

Open the team → **Settings** → **Members** → **Invite**.

- **Open invite link** - anyone with the URL can join. Set a `Max uses` limit if needed.
- **Email invite** - sends a link directly to one address; that link is single-use and only works for that email.

Invites expire after 7 days.

### Access requests

If a team is set to "approval required", visitors see an **Request Access** button instead of joining directly. Co-owners receive a notification and can approve or deny from the admin panel.

### Roles

| Role | Permissions |
|---|---|
| **Owner** | The team creator. Full control, including transferring ownership. |
| **Co-owner** | Full control: manage members, change settings, delete the team |
| **Member** | Create and edit tasks, comment, use all views |

**Read-only access** is not a separate role — it is configured per-project via tab-level permissions. A member whose Kanban tab is set to **read** can see cards but cannot create or move them. Setting a tab to **none** hides it entirely from that member. Set these under Project → **Settings** → **Permissions**.

---

## Views

### Execute

Board view where tasks appear as cards in columns.

- Drag cards between columns to change status
- Click a card to open the task detail panel
- Use the **Sub-plan filter** to show only tasks in the active sub-plan
- Right-click a column header to rename or delete it
- Use **Compact mode** to show more cards on screen

### Tasks

A flat list of all tasks in the project, sorted and filterable.

- Click column headers to sort
- Use the filter bar (top right) to filter by assignee, status, priority, or label
- Select multiple tasks with the checkbox column for bulk actions (assign, move status, delete)

### Gantt

Timeline view showing tasks with start and end dates.

- Drag the left/right edges of a task bar to change its dates
- Drag the entire bar to shift the range
- Task dependencies appear as arrows - create them by dragging from the dot on a task bar to another task
- Milestones appear as diamonds
- Sub-plan swimlanes group tasks by sub-plan (toggle in the top toolbar)

### Canvas

Freeform node graph for planning and mapping. Tasks appear as cards you can freely position.

- Drag from the edge of a card to create a connection to another card
- Double-click the canvas background to create a new task
- Pan by clicking and dragging the background; zoom with scroll wheel
- Canvas layouts are saved per-project and restored on reload

---

## Tasks

### Creating a task

Click **+ New Task** in any view, or press `N` on the keyboard. Fill in the title and press Enter to save quickly, or click **Open** to fill in the full details.

### Task fields

| Field | Description |
|---|---|
| **Title** | Short description of the work |
| **Status** | Current column / state (custom per project) |
| **Priority** | Low / Medium / High / Critical |
| **Assignee** | Team member responsible |
| **Due date** | Target completion date (appears in Gantt and iCal export) |
| **Start date** | Optional start date for Gantt scheduling |
| **Sub-plan** | Which sub-plan this task belongs to |
| **Labels** | Free-text tags for filtering |
| **Estimate** | Numeric estimate used in analytics |
| **Description** | Rich text / markdown body |

### Subtasks

Open a task → click **Add subtask**. Subtasks have their own title and completion checkbox. They're shown inline in the task panel and counted in the parent task's progress bar.

### Comments

Open a task → scroll to the **Comments** section. Type a message and press **Send**. Use `@username` to mention a team member - they'll get an in-app notification and an email (if SMTP is configured).

### Attachments

Open a task → **Attachments** tab → drag files or click to upload. Files are stored in the backend's uploads directory (`/data/uploads`).

### Soft delete and restore

Deleting a task moves it to a 365-day recycle bin. Admins can restore or permanently delete from the Admin panel. After 365 days the task is hard-deleted by the nightly cleanup job.

---

## Search

Press `/` or click the search icon in the sidebar to open global search.

Search covers:
- Task titles and descriptions
- Message content in project chats
- Results are grouped by type and link directly to the task or message

---

## Notifications

The bell icon in the top bar shows unread notifications. Notifications are created for:

- Tasks assigned to you
- `@mention` in comments or messages
- Team invites accepted
- Access requests needing approval

Click a notification to jump to the relevant context.

**Email notifications:** enabled automatically for @mentions if SMTP is configured. Manage your preferences in **Settings** → **Notifications**.

---

## Calendar Export (iCal)

Export task due dates to your calendar app.

1. Open a project → **Settings** → **iCal Export**
2. Copy the subscription URL
3. Add it as a calendar subscription in Google Calendar, Apple Calendar, Outlook, or any app that supports iCal feeds

The feed updates in real time - changes to due dates appear in your calendar automatically.

---

## Analytics

Open a project → **Analytics** tab.

Charts available:
- **Throughput** - tasks completed per week
- **Workload** - open tasks per assignee
- **Cycle velocity** - average time from start to completion
- **Activity feed** - recent events in the project

---

## Personal Settings

Click your avatar or name in the sidebar → **Settings**.

- **Profile** - username, real name, avatar emoji, timezone
- **Security** - change password, enable TOTP (authenticator app)
- **Notifications** - toggle email notifications per type
- **Danger zone** - delete your account (irreversible; removes your data from all teams)

### Enabling TOTP (2FA)

1. Settings → **Security** → **Enable two-factor authentication**
2. Scan the QR code with any authenticator app (Google Authenticator, Authy, 1Password, etc.)
3. Enter the 6-digit code to confirm
4. Save your backup codes somewhere safe

Once enabled, every login asks for a TOTP code after the password.
