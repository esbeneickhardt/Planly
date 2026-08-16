<p align="center">
  <img src="docs/logos/Planly.png" width="320" alt="Planly" />
</p>

<p align="center">
  Self-hosted project management - Canvas, Kanban, Gantt, and per-task chat in one Docker command.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="docs/wiki/Getting-Started.md">Setup Guide</a> · <a href="docs/wiki/API-Reference.md">API Reference</a>
</p>

<div align="center">
<table>
<tr>
  <td align="center"><img src="docs/screenshots/canvas.png" width="380"/><br/><sub>Canvas</sub></td>
  <td align="center"><img src="docs/screenshots/kanban.png" width="380"/><br/><sub>Kanban</sub></td>
</tr>
<tr>
  <td align="center"><img src="docs/screenshots/gantt.png" width="380"/><br/><sub>Gantt</sub></td>
  <td align="center"><img src="docs/screenshots/chat.png" width="380"/><br/><sub>Chat</sub></td>
</tr>
</table>
</div>

## Quick Start

**Requirements:** Docker and Docker Compose v2.

```bash
git clone https://github.com/EsbenEickhardt/planly.git
cd planly
cp .env.example .env
# Edit .env - set DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL, UPLOADS_DIR
# Generate secrets with: openssl rand -hex 32
docker compose up --build -d
```

Open [http://localhost](http://localhost) and register with your `ADMIN_EMAIL` to become the founding admin.

If you didn't set `ADMIN_PASSWORD`, a random password is printed to the backend logs on first start:

```bash
docker compose logs backend | grep "Password:"
```

For HTTPS + automatic TLS: see [Getting Started](docs/wiki/Getting-Started.md).

## Philosophy

Planly is built around a few strong opinions:

- **Plan visually**: Tasks and their dependencies are created and mapped in the canvas. This provides an overview of which tasks need to be completed to reach milestones, and which tasks can be worked on in parallel. All tasks and milestones are directed towards a final goal.
- **No time tracking**: Time spent is not a proxy for value delivered. Planly tracks what matters: what needs doing, who owns it, and when it's due.
- **Everything has an owner**: If a task is everyone's responsibility, it is no one's responsibility. Therefore every task is assigned to an owner. Ownership removes ambiguity and makes accountability visible without surveillance.
- **Your data, your server**: No cloud middleman, no vendor lock-in, no surprise pricing. One `docker compose up` and you're running it yourself.
- **Automation should be easy**: With webhooks, app registrations, personal access tokens at your hand, you can integrate to other systems and automate time-wasting tasks.

## Features

- **Views** - Plan (canvas), Execute (kanban), Progress (gantt), Tasks (full task list), Analytics (throughput, status breakdown, cumulative completions, sprint velocity, per-person workload)
- **Collaboration** - real-time WebSocket updates, per-task comment threads with `@mentions`, project chat with file attachments, plus 1:1 and group direct messages separate from project chat
- **Access control** - role-based team permissions, tab-level overrides, invite links, access request workflow
- **Security** - TOTP 2FA, SSO/OIDC (Google, Entra, Okta, Keycloak, any OIDC provider), IP allowlists, progressive account lockout, audit log
- **API** - REST API, Personal Access Tokens, App Registrations, webhooks (HMAC-signed), iCal export
- **GitHub integration** - inbound webhook receiver that imports opened issues/PRs as tasks and updates task status when a PR is merged or closed, with a rotatable HMAC secret (configure in Settings → Apps, admin-only)

## Documentation

**Setting up your server**

| | |
|---|---|
| [Getting Started](docs/wiki/Getting-Started.md) | Install Planly, configure your environment, first login |

**Managing the server**

| | |
|---|---|
| [Administration](docs/wiki/Administration.md) | Users, audit log, announcements |
| [Security](docs/wiki/Security.md) | Auth model, MFA, CSRF, SSO, IP restrictions |
| [Operations](docs/wiki/Operations.md) | Monitoring, scaling, incident response, backup/restore, key rotation |

**API & Integrations**

| | |
|---|---|
| [Access Tokens](docs/wiki/Access-Tokens.md) | Personal Access Tokens and App Registrations |
| [API Reference](docs/wiki/API-Reference.md) | Interactive API docs served at `/api/docs` in every Planly instance |
| [Webhooks](docs/wiki/Webhooks.md) | Event catalog, payload format, HMAC signature verification |

**Developing Planly**

| | |
|---|---|
| [Development](docs/wiki/Development.md) | Local setup without Docker, architecture overview, migrations, contributing |

## Tech Stack

Fastify 5 + TypeScript · Prisma 5 · PostgreSQL 16 · React 18 + TailwindCSS · WebSocket · Docker Compose (dev) / Traefik + Let's Encrypt (prod)

## License

Source-available under the [Planly Community License v1.1](LICENSE).

**You are free to:** use it, run it, study it, modify it for internal use, and contribute back.

**You may not:** sell it or offer paid hosted access to it · fork it into a competing product · use the code to train AI or ML models · impose further restrictions on recipients.

**If you deploy a modified version as a hosted service** you must make your changes publicly available under the same license.

Contributors grant a royalty-free patent license covering their contributions. For commercial licensing or other permissions, contact esbeneickhardt@gmail.com.
