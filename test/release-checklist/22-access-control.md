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

## API access by role - task endpoints

> Code: [backend/src/middleware/auth.ts](../../backend/src/middleware/auth.ts) (`requireAuth` - verifies JWT and membership) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (membership check before each handler)

For each endpoint and role, expect the listed HTTP status:

| Endpoint | Unauth | Charlie | Alice (member) | Bob (co-owner) | Admin |
|---|---|---|---|---|---|
| GET `/api/products/:id/tasks` | 401 | 403 | 200 | 200 | 200 |
| POST `/api/products/:id/tasks` | 401 | 403 | 201 | 201 | 201 |
| PATCH `/api/products/:id/tasks/:taskId` | 401 | 403 | 200 | 200 | 200 |
| DELETE `/api/products/:id/tasks/:taskId` | 401 | 403 | 200* | 200 | 200 |

*Alice can only delete tasks she created or was assigned to

- [ ] Verify each cell in the table above

---

## API access by role - admin endpoints

> Code: [backend/src/routes/admin/users.ts](../../backend/src/routes/admin/users.ts) · [backend/src/routes/admin/config.ts](../../backend/src/routes/admin/config.ts) · [backend/src/routes/admin/logs.ts](../../backend/src/routes/admin/logs.ts) - all guarded by `requireAdmin`; prune and transfer-crown additionally check `isFoundingAdmin`

| Endpoint | Unauth | Alice | Bob | Admin |
|---|---|---|---|---|
| GET `/api/admin/users` | 401 | 403 | 403 | 200 |
| PUT `/api/admin/users/:id/promote` | 401 | 403 | 403 | 200 |
| GET `/api/admin/server-config` | 401 | 403 | 403 | 200 |
| GET `/api/admin/logs` | 401 | 403 | 403 | 200 |
| DELETE `/api/admin/logs/prune` | 401 | 403 | 403 | 200 (founding admin only) |
| PUT `/api/admin/transfer-crown` | 401 | 403 | 403 | 200 (founding admin only) |

- [ ] Verify each cell

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
- [ ] API: `GET /api/products/:id/tasks` as Alice with kanban=none → 403 (tab-level block)
- [ ] Set Alice's kanban back to `write` → tab reappears

---

## Scoped PAT access control

> Code: [backend/src/routes/api-tokens.ts](../../backend/src/routes/api-tokens.ts) (scope stored on token; middleware enforces `productId` match and blocks admin endpoints for scoped tokens) · [backend/src/middleware/auth.ts](../../backend/src/middleware/auth.ts) (Bearer token lookup and scope check)

See also [18-api-tokens-and-apps.md](18-api-tokens-and-apps.md).

```bash
# Create PAT scoped to Alpha Project
curl -s -b cookies.txt -X POST $BASE/api/auth/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Scoped\",\"productId\":\"$PRODUCT_ID\"}" | jq '.token'
```

- [ ] Scoped PAT: `GET /api/products/$PRODUCT_ID/tasks` → 200
- [ ] Scoped PAT: `GET /api/products/DIFFERENT_PRODUCT_ID/tasks` → 403
- [ ] Scoped PAT: `GET /api/admin/users` → 403
- [ ] Scoped PAT: `GET /api/auth/me` → 200 (me endpoint is always allowed)
- [ ] Unscoped PAT from Alice: `GET /api/admin/users` → 403 (Alice is not admin)
- [ ] Unscoped PAT from Admin: `GET /api/admin/users` → 200

---

## App Registration access control

> Code: [backend/src/routes/app-registrations.ts](../../backend/src/routes/app-registrations.ts) (same scope enforcement as PATs; non-owner cannot issue or delete tokens)

```bash
# Scoped app token (only Alpha Project)
curl -s -b cookies.txt -X POST $BASE/api/apps \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Scoped App\",\"productId\":\"$PRODUCT_ID\"}" | jq .

APP_ID=<id-from-above>
curl -s -b cookies.txt -X POST $BASE/api/apps/$APP_ID/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"v1"}' | jq '.token'
APP_TOKEN=<token>
```

- [ ] `GET /api/products/$PRODUCT_ID/tasks` with `APP_TOKEN` → 200
- [ ] `GET /api/products/OTHER_ID/tasks` with `APP_TOKEN` → 403
- [ ] `GET /api/admin/users` with `APP_TOKEN` → 403
- [ ] Non-owner cannot issue tokens for the registration → 403
- [ ] Non-owner cannot delete the registration → 403

---

## Webhook access control

> Code: [backend/src/routes/webhooks.ts](../../backend/src/routes/webhooks.ts) (co-owner-only guard on create/update/delete)

- [ ] Alice (member) cannot create a webhook → 403
- [ ] Bob (co-owner) can create a webhook → 201
- [ ] Charlie (outsider) cannot list webhooks → 403
- [ ] Admin can always manage webhooks

---

## Cross-product data isolation

> Code: [backend/src/routes/products.ts](../../backend/src/routes/products.ts) (membership check on all product sub-routes) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (taskId is validated against the productId in the URL)

Verify that Alpha Project data is not accessible from Beta Project context:

- [ ] Alpha task ID used in Beta Project URL → 404 or 403
- [ ] Alpha task cannot be moved to Beta project via API
- [ ] Alpha sprint not visible when browsing Beta project
- [ ] Alpha messages not visible in Beta project chat

---

## CSRF protection

> Code: [backend/src/middleware/csrf.ts](../../backend/src/middleware/csrf.ts) - Layer 1: `Origin` header must match `FRONTEND_ORIGIN`; Layer 2 (no Origin): `X-CSRF-Token` must match `csrf` cookie; Bearer auth bypasses both layers

- [ ] `POST /api/products/$PRODUCT_ID/tasks` without `X-CSRF-Token` (cookie session) → 403 "CSRF check failed"
- [ ] Same request with correct `X-CSRF-Token` → 201
- [ ] Same request with Bearer token (no CSRF header) → 201 (Bearer bypasses CSRF)
- [ ] `POST` with wrong `X-CSRF-Token` value → 403
- [ ] Origin header check: `Origin: https://evil.com` → 403

---

## Unauthenticated access to public endpoints

> Code: [backend/src/index.ts](../../backend/src/index.ts) (public routes registered without `requireAuth` hook) · [backend/src/routes/invites.ts](../../backend/src/routes/invites.ts) (GET invite info is public)

These should work without auth:

- [ ] GET `/api/health` → 200
- [ ] GET `/api/health/ready` → 200
- [ ] GET `/api/auth/email-enabled` → 200
- [ ] GET `/api/auth/sso/config` → 200
- [ ] GET `/api/invites/:token` (valid token) → 200
- [ ] GET `/api/uploads/:filename` (without auth) → 401 (**confirm this is correct**)

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
