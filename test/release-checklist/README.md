# Planly - Pre-Release Test Plan

Complete pre-release checklist. Every item must be checked before going public. Cross-reference the section files below for the detailed steps. Where a check says "API:" you should also test the same operation via `curl` with a Bearer token to verify both the UI and the API surface behave identically.

---

## How to use this plan

1. Work through sections in the order below.
2. Set up the **four test user accounts** described in [01-setup.md](01-setup.md) before starting any other section - most checks depend on them.
3. Mark each checkbox as you go. Do not skip a section even if you think it "obviously works".
4. Log any failures in the **Bug Log** at the bottom of the relevant section file.
5. When all files are fully checked, the release is go.

---

## Section Index

| # | File | What it covers |
|---|------|----------------|
| 1 | [01-setup.md](01-setup.md) | Test user setup, environment, tools |
| 2 | [02-deployment-and-config.md](02-deployment-and-config.md) | Docker, .env variables, health, metrics, first-start |
| 3 | [03-auth.md](03-auth.md) | Register, login, TOTP, SSO, lockout, password reset |
| 4 | [04-admin.md](04-admin.md) | All admin panel tabs and admin-only API routes |
| 5 | [05-teams-products-membership.md](05-teams-products-membership.md) | Teams, products, invites, access requests, roles |
| 6 | [06-task-management.md](06-task-management.md) | Task CRUD, subtasks, dependencies, detail panel |
| 7 | [07-kanban.md](07-kanban.md) | Columns, drag-drop, filters, compact view, backgrounds |
| 8 | [08-backlog.md](08-backlog.md) | Backlog list, filters, sort, sprint assignment |
| 9 | [09-gantt.md](09-gantt.md) | Gantt chart, milestones, timeline, dependencies |
| 10 | [10-canvas.md](10-canvas.md) | Canvas view, nodes, edges, snapshots |
| 11 | [11-sprints.md](11-sprints.md) | Sprint management, velocity, carry-over |
| 12 | [12-messaging.md](12-messaging.md) | Chat, messages, reactions, attachments, WebSocket |
| 13 | [13-announcements.md](13-announcements.md) | Announcements, comments, pinning |
| 14 | [14-notifications.md](14-notifications.md) | Notification bell, real-time, preferences |
| 15 | [15-search.md](15-search.md) | Global search across tasks and messages |
| 16 | [16-settings.md](16-settings.md) | Product settings (all tabs) |
| 17 | [17-api-tokens-and-apps.md](17-api-tokens-and-apps.md) | PATs, App Registrations, scoping |
| 18 | [18-webhooks.md](18-webhooks.md) | Webhook CRUD, events, signatures, deliveries |
| 19 | [19-integrations.md](19-integrations.md) | iCal, data export, GitHub integration |
| 20 | [20-api-endpoints.md](20-api-endpoints.md) | Every REST endpoint with curl examples |
| 21 | [21-access-control.md](21-access-control.md) | Full RBAC matrix, tab permissions, outsider checks |
| 22 | [22-security.md](22-security.md) | CSRF, headers, XSS, IP rules, rate limits, encryption |
| 23 | [23-repository-and-docs.md](23-repository-and-docs.md) | README, LICENSE, wiki, .env.example, public assets — **run last** |

---

## Progress tracker

Copy and paste into a running note as you work:

```
[ ] 01 Setup
[ ] 02 Deployment & Config
[ ] 03 Auth
[ ] 04 Admin
[ ] 05 Teams, Products & Membership
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
[ ] 17 API Tokens & Apps
[ ] 18 Webhooks
[ ] 19 Integrations
[ ] 20 API Endpoints
[ ] 21 Access Control
[ ] 22 Security
[ ] 23 Repository & Docs  ← run last
```

---

## Known gaps (investigate before release)

- [ ] `POST /api/seed-examples` is exposed in production - confirm it is guarded or disabled
- [ ] `GET /api/metrics` - confirm `METRICS_SECRET` is required in production build
- [ ] `docs/screenshots/` directory is empty - README references it
- [ ] `SECURITY.md` lists reporting email `security@planly.app` - confirm it exists/redirects
- [ ] Icon directories `public/icons/avatars/` and `public/icons/projects/` - confirm any default icons are present
