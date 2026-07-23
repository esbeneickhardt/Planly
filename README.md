<p align="center">
  <img src="docs/Planly.png" width="320" alt="Planly" />
</p>

<p align="center">
  Self-hosted project management - Kanban, Gantt, Canvas, and per-task chat in one Docker command.
</p>

---

## Quick Start

**Requirements:** Docker and Docker Compose v2.

```bash
git clone https://github.com/EsbenEickhardt/planly.git
cd planly
cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL
# Generate secrets with: openssl rand -hex 32
docker compose up --build
```

Open [http://localhost](http://localhost) and register with your `ADMIN_EMAIL` to become the founding admin.

If you didn't set `ADMIN_PASSWORD`, a random password is printed to the backend logs on first start:

```bash
docker compose logs backend | grep "Password:"
```

For HTTPS + automatic TLS: [Deployment guide](docs/wiki/Deployment.md).

---

## Features

- **Views** — Kanban, Backlog, Gantt, Canvas, Sprint board
- **Collaboration** — real-time WebSocket updates, per-task comment threads with `@mentions`, project chat with file attachments
- **Access control** — role-based team permissions, tab-level overrides, invite links, access request workflow
- **Security** — TOTP 2FA, SSO/OIDC (Google, Entra, Okta, Keycloak, any OIDC provider), IP allowlists, progressive account lockout, audit log
- **API** — REST API, Personal Access Tokens, App Registrations, webhooks (HMAC-signed), iCal export

---

## Documentation

| | |
|---|---|
| [Getting Started](docs/wiki/Getting-Started.md) | Install, first login, invite your team |
| [Configuration](docs/wiki/Configuration.md) | Env vars, SMTP, SSO/OIDC |
| [Deployment](docs/wiki/Deployment.md) | Dev vs production, upgrades, backups |
| [User Guide](docs/wiki/User-Guide.md) | Views, tasks, search, calendar export |
| [API Reference](docs/wiki/API-Reference.md) | REST endpoints with examples |
| [Webhooks](docs/wiki/Webhooks.md) | Event catalog, payloads, signature verification |
| [Access Tokens](docs/wiki/Access-Tokens.md) | PATs and App Registrations |
| [Security](docs/wiki/Security.md) | Auth model, MFA, CSRF, IP restrictions |
| [Administration](docs/wiki/Administration.md) | Admin panel, audit logs, user management |
| [Development](docs/wiki/Development.md) | Local dev setup, architecture |

---

## Tech Stack

Fastify 5 + TypeScript · Prisma 5 · PostgreSQL 16 · React 18 + TailwindCSS · WebSocket · Docker Compose (dev) / Traefik + Let's Encrypt (prod)

---

## License

Source-available under the [Planly Community License v1.0](LICENSE). Use it, run it, study it, contribute to it — freely. You may not sell it, fork it into a competing product, or use the code to train AI models.
