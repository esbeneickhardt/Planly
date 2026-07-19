# 22 - Access Control & RBAC

← [Back to index](README.md)

This section tests the full role and permission matrix. Use the four test accounts from [01-setup.md](01-setup.md):

- **Admin** (founding admin, co-owner of Alpha Project)
- **Alice** (member of Alpha Project, no admin)
- **Bob** (co-owner of Alpha Project, no server admin)
- **Charlie** (outsider - not a member of Alpha Project)

---

## Role hierarchy overview

| Role | Can do |
|---|---|
| Unauthenticated | Public pages only |
| Regular user | Own account, teams they belong to |
| Co-owner | Full product management including settings, webhooks, permissions |
| Server admin | All server-level actions (admin panel, user management) |
| Founding admin | All admin + ownership transfer + log pruning |

---

## Admin access by role

- [ ] Alice (member) navigating to `/admin` → redirected or access denied
- [ ] Bob (co-owner, not server admin) navigating to `/admin` → redirected or access denied
- [ ] Admin can access all Admin panel sections

---

## Tab permissions

> Code: [backend/src/routes/permissions.ts](../../backend/src/routes/permissions.ts) (stores overrides per user per tab) · [frontend/src/context/PermissionContext.tsx](../../frontend/src/context/PermissionContext.tsx) (loads `GET /api/me/permissions`; hides tabs when `none`; blocks write actions when `read`)

Default permissions per SECURITY.md:

| Tab | member | co_owner |
|---|---|---|
| kanban | write | write |
| backlog | write | write |
| gantt | read | write |
| canvas | write | write |
| messages | write | write |
| analytics | read | write |
| settings | none | write |

### Test tab permission enforcement for Alice:

- [ ] Alice sees Kanban (write) - can drag tasks
- [ ] Alice sees Backlog (write) - can create tasks
- [ ] Alice sees Gantt (read) - can view; cannot create milestones
- [ ] Alice sees Canvas (write) - can add nodes
- [ ] Alice sees Messages (write) - can send messages
- [ ] Alice sees Analytics (read) - can view charts; cannot edit
- [ ] Alice does NOT see Settings (none) - tab is hidden

### Override tab permissions:

- [ ] Set Alice's kanban to `none` → Kanban tab disappears for Alice
- [ ] Set Alice's kanban back to `write` → tab reappears

---

## Webhook and token access control

- [ ] Alice (member) — Webhooks tab in Settings is hidden or blocked
- [ ] Bob (co-owner) — can create and manage webhooks in Settings
- [ ] Full PAT and App Registration access control tests → [17-api-tokens-and-apps.md](17-api-tokens-and-apps.md) (Phase 3)
- [ ] Full webhook delivery tests → [18-webhooks.md](18-webhooks.md) (Phase 2)

---

## Cross-product data isolation

> Code: [backend/src/routes/products.ts](../../backend/src/routes/products.ts) (membership check on all product sub-routes) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (taskId is validated against the productId in the URL)

Verify that Alpha Project data is not accessible from Beta Project context:

- [ ] Alpha task ID used in Beta Project URL → not found or access denied
- [ ] Alpha sprint not visible when browsing Beta project
- [ ] Alpha messages not visible in Beta project chat

---

## CSRF and curl security tests

> Full curl-based CSRF, cookie, and header tests are in [22-security.md](22-security.md). Quick UI check:

- [ ] Normal app usage works without any CSRF errors in browser console
- [ ] File downloads require login (navigating to a `/api/uploads/:filename` URL without being logged in → 401 or redirected)

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
