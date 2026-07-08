# Configuration

All configuration is done through environment variables in a `.env` file. Copy `.env.example` to `.env` to get started.

---

## Required Variables

These three must be set before the app will start. The backend exits at startup with a clear error message if any are missing.

| Variable | Description | How to generate |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL container password | Any strong random string |
| `JWT_SECRET` | JWT signing key (min 32 chars) | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256-GCM key for at-rest secrets | `openssl rand -hex 32` |

> `ENCRYPTION_KEY` is used to encrypt webhook secrets and SMTP passwords stored in the database. Losing this key makes those values unreadable. Back it up securely alongside your database.

---

## App Settings

| Variable | Default | Description |
|---|---|---|
| `FRONTEND_ORIGIN` | `http://localhost:80` | Frontend URL — must exactly match what browsers send as the `Origin` header. Used for CORS and CSRF validation. |
| `APP_URL` | Same as `FRONTEND_ORIGIN` | Base URL used in email links (password reset, invites). Set to your public domain in production. |
| `PORT` | `3000` | Backend listen port (internal to Docker network) |
| `COOKIE_SECURE` | `true` | Set to `false` only for local HTTP-only development. Controls the `Secure` flag on auth cookies. |
| `TRUSTED_PROXY_DEPTH` | `1` | Number of trusted reverse proxy hops. Used to read the real client IP from `X-Forwarded-For`. `1` for the default Docker Compose Nginx. `0` if exposing the backend directly. |
| `LOG_LEVEL` | `info` | Fastify log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `UPLOADS_DIR` | `/tmp/planly-uploads` | Directory for file attachment storage |
| `ADMIN_LOG_RETENTION_DAYS` | `365` | How many days of admin audit logs to retain. Older entries are pruned by the nightly cleanup job. |

---

## Admin Account

| Variable | Description |
|---|---|
| `ADMIN_EMAIL` | Email of the founding admin. If the account doesn't exist yet it is created on startup with a random password (printed to the logs). If it already exists the `isAdmin` flag is set. |
| `ADMIN_PASSWORD` | Initial password for the auto-created admin account. If omitted, a random password is generated and logged. |
| `RECROWN_EMAIL` | Emergency: transfers the founding-admin seat to this email on next startup. Remove from `.env` after the restart. |

---

## Email / SMTP

SMTP is optional. When not configured, emails are logged to the container console (handy for development).

**Preferred:** configure via Admin UI → **Email**. Credentials are stored encrypted in the database and take effect without a restart.

**Alternative:** environment variables (requires restart on changes):

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | — | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for port 465 (SMTPS); `false` for STARTTLS on 587 |
| `SMTP_USER` | — | SMTP authentication username |
| `SMTP_PASS` | — | SMTP authentication password / app password |
| `SMTP_FROM` | `Planly <noreply@planly.app>` | From address on outgoing emails |

> Store `SMTP_PASS` in `.env`, never directly in `docker-compose.yml`. `.env` is gitignored.

### Common providers

**Gmail:** create an [App Password](https://myaccount.google.com/apppasswords), use `smtp.gmail.com` port `587`.

**Microsoft 365:** use `smtp.office365.com` port `587`, STARTTLS.

**SendGrid:** use `smtp.sendgrid.net` port `587`, username `apikey`, password = your API key.

**Mailgun:** use `smtp.mailgun.org` port `587`.

---

## SSO / OIDC

Enables a "Sign in with \<provider\>" button on the login page. Works with any OpenID Connect provider.

| Variable | Description |
|---|---|
| `OIDC_ISSUER` | Provider issuer URL (see examples below) |
| `OIDC_CLIENT_ID` | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | OAuth2 client secret |
| `OIDC_PROVIDER_NAME` | Label for the login button (default: `SSO`) |
| `OIDC_SCOPES` | Space-separated scopes (default: `openid email profile`) |

**Register your app with the callback URL:**
```
https://planly.yourdomain.com/api/auth/sso/callback
```

### Provider examples

| Provider | `OIDC_ISSUER` |
|---|---|
| Google | `https://accounts.google.com` |
| Microsoft Entra | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Auth0 | `https://<tenant>.auth0.com` |
| Okta | `https://<tenant>.okta.com` |
| Keycloak | `https://<host>/realms/<realm>` |

---

## Security Alerting

| Variable | Description |
|---|---|
| `SECURITY_ALERT_WEBHOOK_URL` | POST endpoint for high-severity security events (account lockouts, suspicious logins). Supports Slack incoming webhooks, Discord webhooks, or any JSON HTTP endpoint. |

Example Slack payload sent on a lockout event:
```json
{
  "text": "🔒 Account locked: user@example.com (5 failed attempts) from IP 203.0.113.42"
}
```

---

## Production-only Variables

Used only with `docker-compose.prod.yml`:

| Variable | Description |
|---|---|
| `DOMAIN` | Public hostname (e.g. `planly.yourdomain.com`) |
| `ACME_EMAIL` | Email for Let's Encrypt certificate notifications |
| `BACKUP_DIR` | Host path for automated backups (default: `./backups`) |

---

## Key Rotation

If you need to rotate `ENCRYPTION_KEY` (recommended annually or when a key-holder leaves):

```bash
# Set both old and new keys, then run the rotation script
OLD_ENCRYPTION_KEY=<old-hex-key> \
NEW_ENCRYPTION_KEY=<new-hex-key> \
DATABASE_URL=<your-database-url> \
npx tsx scripts/rotate-encryption-key.ts
```

The script re-encrypts all affected values in-place and exits. Update `.env` to `ENCRYPTION_KEY=<new-hex-key>` and restart.
