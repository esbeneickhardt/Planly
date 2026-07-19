# Planly - Pre-Release Test Plan

Three phases. Complete them in order. Phase 1 is manual browser testing; Phases 2 and 3 can be run with curl commands and I (Claude) can execute them for you.

---

## Phase 1 — UI Testing (manual, browser)

Work through sections 03–16 in order. Log in as different users to verify that each person sees and can do exactly what their role allows — nothing more, nothing less. Use the four test users from [01-setup.md](01-setup.md).

| # | File | What it covers |
|---|------|----------------|
| ✅ | [01-setup.md](01-setup.md) | Test user setup, environment |
| ✅ | [02-deployment-and-config.md](02-deployment-and-config.md) | Docker, .env, health checks, first-start |
| 3 | [03-auth.md](03-auth.md) | Login, TOTP, password reset, email verification, lockout |
| 4 | [04-admin.md](04-admin.md) | Admin panel — users, projects, email, audit logs, IP rules |
| 5 | [05-teams-products-membership.md](05-teams-products-membership.md) | Teams, projects, invites, access requests, roles |
| 6 | [06-task-management.md](06-task-management.md) | Task CRUD, subtasks, dependencies, detail panel |
| 7 | [07-kanban.md](07-kanban.md) | Board columns, drag-drop, filters, compact view |
| 8 | [08-backlog.md](08-backlog.md) | Backlog list, filters, sort |
| 9 | [09-gantt.md](09-gantt.md) | Gantt chart, milestones, timeline |
| 10 | [10-canvas.md](10-canvas.md) | Canvas / Plan view, nodes, edges |
| 11 | [11-sprints.md](11-sprints.md) | Sprint management |
| 12 | [12-messaging.md](12-messaging.md) | Chat, reactions, attachments, real-time |
| 13 | [13-announcements.md](13-announcements.md) | Announcements, comments, pinning |
| 14 | [14-notifications.md](14-notifications.md) | Notification bell, real-time, preferences |
| 15 | [15-search.md](15-search.md) | Global search |
| 16 | [16-settings.md](16-settings.md) | Project settings (all tabs) |
| 21 | [21-access-control.md](21-access-control.md) | Full permission matrix with different user roles |
| 22 | [22-security.md](22-security.md) | XSS rendering, CSRF (curl), headers (curl), rate limits |

---

## Phase 2 — Webhooks (curl, ask Claude)

| # | File | What it covers |
|---|------|----------------|
| 18 | [18-webhooks.md](18-webhooks.md) | Webhook delivery, signatures, event types, retries |

---

## Phase 3 — API Tokens, Apps, iCal & Integrations (curl, ask Claude)

| # | File | What it covers |
|---|------|----------------|
| 17 | [17-api-tokens-and-apps.md](17-api-tokens-and-apps.md) | PATs, App Registrations, token scoping, expiry |
| 19 | [19-integrations.md](19-integrations.md) | iCal feed, data export, GitHub integration |

---

## Known gaps (confirm before launch)

- [ ] `POST /api/seed-examples` — confirm it is guarded or removed in production
- [ ] `GET /api/metrics` — confirm `METRICS_SECRET` is required in production
- [ ] `security@planly.app` reporting email — confirm it exists or redirects to your inbox
- [ ] `docs/screenshots/` — remove placeholder notice from README or add real screenshots

---

## Progress tracker

```
[ ] 03 Auth
[ ] 04 Admin
[ ] 05 Teams & Membership
[ ] 06 Task Management
[ ] 07 Kanban
[ ] 08 Backlog
[ ] 09 Gantt
[ ] 10 Canvas
[ ] 11 Sprints
[ ] 12 Messaging
[ ] 13 Announcements
[ ] 14 Notifications
[ ] 15 Search
[ ] 16 Settings
[ ] 21 Access Control
[ ] 22 Security
--- Phase 2 ---
[ ] 18 Webhooks
--- Phase 3 ---
[ ] 17 API Tokens & Apps
[ ] 19 Integrations
```
