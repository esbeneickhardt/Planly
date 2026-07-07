# Planly

A self-hosted project management platform. Kanban boards, Gantt charts, canvas views, team chat, sprints, analytics, and more — all in one Docker Compose stack.

---

## Features

- **Kanban** — Drag-and-drop columns and cards, sprint filtering, compact mode, custom backgrounds
- **Backlog** — Full task list with filtering, sorting, bulk actions
- **Gantt** — Timeline view with milestones, dependencies, and sprint lanes
- **Canvas** — Free-form node graph for mapping task relationships
- **Chat** — Per-project messaging with @mentions, emoji reactions, file attachments, and admin chat
- **Sprints** — Sprint planning with auto-initialization and carry-over
- **Analytics** — Throughput charts, workload distribution, cycle velocity, activity feed
- **Teams** — Multi-team support with co-owner roles and per-feature write permissions
- **Announcements** — Pinned posts with markdown content and comments
- **SSO** — SAML 2.0 integration
- **TOTP** — Two-factor authentication
- **API tokens** — Scoped personal access tokens for integrations
- **Webhooks** — Per-event HTTP webhooks with HMAC signing
- **IP restrictions** — Allowlist / blocklist with CIDR support
- **Admin panel** — User management, email whitelist, server config, audit logs

---

## Local development (5 minutes)

**Requirements**: Docker Engine 24+ and Docker Compose v2.

```bash
# 1. Clone and copy env
cp .env.example .env          # edit JWT_SECRET and APP_URL at minimum

# 2. Start the stack
docker compose up -d

# 3. Open the app
open http://localhost:3000
```

The first user to register becomes the founding admin.

---

## Production deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for TLS setup, production compose file, and upgrade instructions.

## Security

See [SECURITY.md](SECURITY.md) for the threat model, responsible disclosure policy, and hardening notes.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Fastify 5 · TypeScript · Prisma 5 |
| Database | PostgreSQL 16 |
| Frontend | React 18 · Vite · TailwindCSS |
| Runtime | Node 22 · Docker Compose |
