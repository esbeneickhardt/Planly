# 09 - Backlog

← [Back to index](README.md)

Navigate to `/backlog` in Alpha Project.

---

## Basic display

> Code: [frontend/src/pages/BacklogPage.tsx](../../frontend/src/pages/BacklogPage.tsx) · [frontend/src/hooks/useBacklogFilters.ts](../../frontend/src/hooks/useBacklogFilters.ts) (tab counts, mine toggle, sort, search)

- [ ] Backlog page loads without error
- [ ] Tasks appear in a list (not Kanban cards)
- [ ] Tab bar shows: **All**, **Backlog**, **To Do**, **In Progress**, **Done**, **Blocked**
- [ ] Default tab is **Backlog**
- [ ] Tab counts next to each label match actual task counts
- [ ] "Unassigned" badge count shown in sidebar or header
- [ ] "Overdue" badge count shown

---

## Status tab filtering

> Code: [frontend/src/hooks/useBacklogFilters.ts](../../frontend/src/hooks/useBacklogFilters.ts) (derives per-tab task lists from the flat task array)

- [ ] Click "All" → all tasks shown
- [ ] Click "To Do" → only `todo` tasks shown
- [ ] Click "In Progress" → only `in_progress` tasks shown
- [ ] Click "Done" → only `done` tasks shown
- [ ] Click "Blocked" → only `blocked` tasks shown
- [ ] Click "Backlog" → only `backlog` tasks shown
- [ ] Tab counts are accurate for each tab

---

## Search

> Code: [frontend/src/hooks/useBacklogFilters.ts](../../frontend/src/hooks/useBacklogFilters.ts) (client-side name filter) · [frontend/src/pages/BacklogPage.tsx](../../frontend/src/pages/BacklogPage.tsx) (search input)

- [ ] Type in search box → list filters live as you type
- [ ] Search is case-insensitive
- [ ] Search on "All" tab searches across all statuses
- [ ] Clear search → full list returns
- [ ] Search with no results → empty state message shown

---

## Mine toggle

> Code: [frontend/src/hooks/useBacklogFilters.ts](../../frontend/src/hooks/useBacklogFilters.ts) (`mineOnly` flag - filters by `task.ownerId === currentUser.id`)

- [ ] Toggle "Mine only" → only tasks owned by current user shown
- [ ] Tab counts update to reflect mine-only view
- [ ] Toggle off → all tasks visible again

---

## Sort options

> Code: [frontend/src/hooks/useBacklogFilters.ts](../../frontend/src/hooks/useBacklogFilters.ts) (sort comparators: oldest/newest/alphabetical/unassigned/deadline)

- [ ] Sort by **Oldest** (default) → ascending by `createdAt`
- [ ] Sort by **Newest** → descending by `createdAt`
- [ ] Sort by **Alphabetical** → A–Z by task name
- [ ] Sort by **Unassigned** → tasks without an owner listed first
- [ ] Sort by **Deadline** → nearest deadline first, no-deadline last
- [ ] Sort selection persists when switching tabs

---

## Sprint assignment from backlog

> Code: [backend/src/routes/sprints.ts](../../backend/src/routes/sprints.ts) (add/remove task from sprint) · [frontend/src/components/common/TaskDetailPanel.tsx](../../frontend/src/components/common/TaskDetailPanel.tsx) (sprint picker in detail panel)

- [ ] Assign a task to Sprint 1 from the backlog row or detail panel
- [ ] Task moves out of "No sprint" filter
- [ ] Remove from sprint → task back to backlog unassigned to sprint

---

## Task creation from backlog

> Code: [frontend/src/pages/BacklogPage.tsx](../../frontend/src/pages/BacklogPage.tsx) (new-task button) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (POST handler)

- [ ] Click "+ New task" or equivalent in Backlog → task creation modal/inline
- [ ] Created task appears in the list under the current tab's status
- [ ] Created task appears on Kanban board

---

## Interaction with task detail panel

> Code: [frontend/src/components/common/TaskDetailPanel.tsx](../../frontend/src/components/common/TaskDetailPanel.tsx) · [frontend/src/hooks/useRealtimeUpdates.ts](../../frontend/src/hooks/useRealtimeUpdates.ts) (real-time update propagates to backlog list)

- [ ] Click a task row → detail panel opens
- [ ] Edit name in panel → backlog row updates in real time
- [ ] Change status in panel → task moves to the appropriate tab

---

## Mobile responsiveness

At 375px width:

- [ ] Backlog renders without horizontal overflow
- [ ] Status tabs scroll horizontally if too many to fit
- [ ] Sort and search controls accessible

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
