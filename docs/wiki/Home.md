# Planly Documentation

Welcome to the Planly documentation wiki. Use the navigation below to find what you need.

---

## Setup & Deployment

| Document | Summary |
|---|---|
| [Getting Started](Getting-Started.md) | Install Planly for the first time, create your first team |
| [Configuration](Configuration.md) | Environment variables, SMTP, SSO/OIDC, security settings |
| [Deployment](Deployment.md) | Development vs production setups, upgrades, backups |

## Using Planly

| Document | Summary |
|---|---|
| [User Guide](User-Guide.md) | Projects, tasks, views, comments, search, notifications, calendar export |
| [Administration](Administration.md) | Admin panel, user management, audit logs, announcements |

## Integrations & API

| Document | Summary |
|---|---|
| [API Reference](API-Reference.md) | All REST endpoints with request/response examples |
| [Webhooks](Webhooks.md) | Event catalog, payload format, HMAC signature verification |
| [Access Tokens](Access-Tokens.md) | Personal Access Tokens and App Registrations |

## Security & Development

| Document | Summary |
|---|---|
| [Security](Security.md) | Authentication model, CSRF, MFA, SSO, IP restrictions, audit logging |
| [Development](Development.md) | Local dev setup, architecture overview, contributing |

---

## Quick Reference

### Minimum required environment variables

```env
DB_PASSWORD=<strong-random-string>
JWT_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
```

### Start for local development

```bash
docker compose up --build
```

### Start for production (with TLS)

```bash
# .env must also contain DOMAIN and ACME_EMAIL
docker compose -f docker-compose.prod.yml up --build -d
```

### Health check endpoint

```
GET /api/health
→ { "ok": true, "db": "connected", "uptime": 1234 }
```
