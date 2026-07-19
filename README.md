# Planly

**Kanban, Gantt, Canvas, and per-task chat - self-hosted in one command.**

Plan visually, track dependencies, and keep conversations where the work is. No subscriptions, no cloud middleman.

---

## Quick Start

**Requirements:** Docker and Docker Compose v2.

```bash
# 1. Clone
git clone https://github.com/EsbenEickhardt/planly.git
cd planly

# 2. Configure
cp .env.example .env
# Edit .env - fill in DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL
# Generate secrets with: openssl rand -hex 32

# 3. Run
docker compose up --build
```

Open [http://localhost](http://localhost) and register with your `ADMIN_EMAIL` to become the founding admin.

**For production (HTTPS + automatic TLS):** see the [Deployment guide](docs/wiki/Deployment.md).

---

## Documentation

| Guide | What's covered |
|---|---|
| [Getting Started](docs/wiki/Getting-Started.md) | Install, first login, create a team |
| [Configuration](docs/wiki/Configuration.md) | All env vars, SMTP, SSO/OIDC |
| [Deployment](docs/wiki/Deployment.md) | Dev vs production, upgrades, backups |
| [User Guide](docs/wiki/User-Guide.md) | Views, tasks, comments, search, calendar export |
| [API Reference](docs/wiki/API-Reference.md) | All REST endpoints with examples |
| [Webhooks](docs/wiki/Webhooks.md) | Event catalog, payload format, signature verification |
| [Access Tokens](docs/wiki/Access-Tokens.md) | PATs and App Registrations |
| [Administration](docs/wiki/Administration.md) | Admin panel, audit logs, user management |
| [Security](docs/wiki/Security.md) | Auth model, CSRF, MFA, SSO, IP restrictions |
| [Development](docs/wiki/Development.md) | Local dev setup, architecture, contributing |

---

## Features

### Project Views
- **Kanban** - drag-and-drop board with custom columns, sprint filtering, compact mode, and custom backgrounds
- **Backlog** - flat sorted list for sprint-style prioritization with bulk actions
- **Gantt** - timeline chart with milestones, dependencies, and sprint lanes
- **Canvas** - freeform planning board for mapping task relationships and roadmaps
- **Sprint board** - sprint management with auto-initialization, carry-over, and velocity tracking

### Collaboration
- Real-time updates over WebSocket - changes appear instantly for every team member
- Per-task comment threads with `@mention` support and email notifications
- Per-project chat with emoji reactions, file attachments, and admin chat
- Team-scoped announcements pinnable to the top of views
- Cross-project search across tasks and messages

### Access Control
- Role-based permissions (owner, co-owner, member, viewer) per team
- Tab-level permission overrides per project (e.g. hide Kanban from viewers)
- Invite links - open multi-use or email-targeted single-use
- Access request workflow for closed teams

### API & Integrations
- **Personal Access Tokens (PATs)** - long-lived tokens for scripting, CI/CD, or automations; optionally scoped to a single project
- **App Registrations** - named service accounts with rotating tokens for server-to-server integrations
- **Webhooks** - push events to any HTTP endpoint; payloads signed with HMAC-SHA256; per-event filtering
- **iCal export** - subscribe to task deadlines from any calendar app

### Security
- TOTP (authenticator app) two-factor authentication
- SSO / OpenID Connect - Google, Microsoft Entra, Auth0, Okta, Keycloak, and any OIDC provider
- Progressive account lockout on repeated failed logins (15 min → 1 h → 24 h → 7 days)
- IP allowlist / blocklist with CIDR range support
- Double-submit CSRF protection on all mutating requests
- AES-256-GCM encryption of secrets at rest (webhook secrets, SMTP passwords)
- Full admin audit log with CSV/JSONL export and configurable retention

### Administration
- Web-based admin panel - no shell access required for day-to-day management
- Founding admin bootstrapped from an environment variable on first start
- SMTP configuration through the UI (credentials stored encrypted, never in env files)
- Automated daily data-retention cleanup (notifications, activity events, audit logs)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Fastify 5 + TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Frontend | React 18 + TypeScript + TailwindCSS |
| Realtime | WebSocket (`@fastify/websocket`) |
| Auth | httpOnly JWT cookie + TOTP + OIDC |
| Container | Docker Compose (dev) · Traefik + Let's Encrypt (prod) |

---

## Philosophy

Most project management tools have drifted into feature bloat, enterprise pricing tiers, and opaque data practices. Planly is a pushback against that.

**Own your data.** Everything lives in your PostgreSQL database, on your server. No third-party cloud stores your task content, comments, or attachments.

**Simple to deploy.** One `docker compose up` command and you have a production-ready instance with automatic TLS. No Kubernetes cluster, no microservices maze.

**No artificial complexity.** Projects, tasks, teams. Views that actually help - Kanban for flow, Backlog for volume, Gantt for timelines, Canvas for big-picture planning. Nothing that exists just to justify a pricing tier.

**Security as a baseline.** MFA, SSO/OIDC, IP allowlists, audit logs, signed webhooks, and scoped API tokens are all included by default - not premium add-ons.

---

## License

Source-available under the [Planly Community License v1.0](LICENSE).  
Use it, run it, study it, contribute to it - freely. You may not sell it, fork it into a competing product, or use the code to train AI models.

---

## Contributing

This project is source-available and maintained by a single author. Pull requests are not accepted. Feel free to fork it for your own use under the terms of the license.
