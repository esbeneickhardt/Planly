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
| 2 | [02-repository-and-docs.md](02-repository-and-docs.md) | README, LICENSE, wiki, .env.example, public assets |
| 3 | [03-deployment-and-config.md](03-deployment-and-config.md) | Docker, .env variables, health, metrics, first-start |
| 4 | [04-auth.md](04-auth.md) | Register, login, TOTP, SSO, lockout, password reset |
| 5 | [05-admin.md](05-admin.md) | All admin panel tabs and admin-only API routes |
| 6 | [06-teams-products-membership.md](06-teams-products-membership.md) | Teams, products, invites, access requests, roles |
| 7 | [07-task-management.md](07-task-management.md) | Task CRUD, subtasks, dependencies, detail panel |
| 8 | [08-kanban.md](08-kanban.md) | Columns, drag-drop, filters, compact view, backgrounds |
| 9 | [09-backlog.md](09-backlog.md) | Backlog list, filters, sort, sprint assignment |
| 10 | [10-gantt.md](10-gantt.md) | Gantt chart, milestones, timeline, dependencies |
| 11 | [11-canvas.md](11-canvas.md) | Canvas view, nodes, edges, snapshots |
| 12 | [12-sprints.md](12-sprints.md) | Sprint management, velocity, carry-over |
| 13 | [13-messaging.md](13-messaging.md) | Chat, messages, reactions, attachments, WebSocket |
| 14 | [14-announcements.md](14-announcements.md) | Announcements, comments, pinning |
| 15 | [15-notifications.md](15-notifications.md) | Notification bell, real-time, preferences |
| 16 | [16-search.md](16-search.md) | Global search across tasks and messages |
| 17 | [17-settings.md](17-settings.md) | Product settings (all tabs) |
| 18 | [18-api-tokens-and-apps.md](18-api-tokens-and-apps.md) | PATs, App Registrations, scoping |
| 19 | [19-webhooks.md](19-webhooks.md) | Webhook CRUD, events, signatures, deliveries |
| 20 | [20-integrations.md](20-integrations.md) | iCal, data export, GitHub integration |
| 21 | [21-api-endpoints.md](21-api-endpoints.md) | Every REST endpoint with curl examples |
| 22 | [22-access-control.md](22-access-control.md) | Full RBAC matrix, tab permissions, outsider checks |
| 23 | [23-security.md](23-security.md) | CSRF, headers, XSS, IP rules, rate limits, encryption |

---

## Progress tracker

Copy and paste into a running note as you work:

```
[ ] 01 Setup
[ ] 02 Repository & Docs
[ ] 03 Deployment & Config
[ ] 04 Auth
[ ] 05 Admin
[ ] 06 Teams, Products & Membership
[ ] 07 Task Management
[ ] 08 Kanban
[ ] 09 Backlog
[ ] 10 Gantt
[ ] 11 Canvas
[ ] 12 Sprints
[ ] 13 Messaging
[ ] 14 Announcements
[ ] 15 Notifications
[ ] 16 Search
[ ] 17 Settings
[ ] 18 API Tokens & Apps
[ ] 19 Webhooks
[ ] 20 Integrations
[ ] 21 API Endpoints
[ ] 22 Access Control
[ ] 23 Security
```

---

## Known gaps (investigate before release)

- [ ] `POST /api/seed-examples` is exposed in production - confirm it is guarded or disabled
- [ ] `GET /api/metrics` - confirm `METRICS_SECRET` is required in production build
- [ ] `docs/screenshots/` directory is empty - README references it
- [ ] `SECURITY.md` lists reporting email `security@planly.app` - confirm it exists/redirects
- [ ] Icon directories `public/icons/avatars/` and `public/icons/projects/` - confirm any default icons are present
