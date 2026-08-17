# Getting Started

This guide walks you from zero to a running Planly instance. Follow the steps in order, and by the end you will have the app running, an admin account, and your first project set up. Everything you need is on this page.

---

## Contents

- [Prerequisites](#prerequisites)
- [Step 1: Clone the repository](#step-1-clone-the-repository)
- [Step 2: Create and configure your `.env` file](#step-2-create-and-configure-your-env-file)
  - [Required](#required-the-app-will-not-start-without-these)
  - [File storage](#file-storage)
  - [Admin account](#admin-account)
  - [App settings](#app-settings)
  - [Email / SMTP](#email--smtp-optional-but-recommended)
  - [SSO / OIDC](#sso--oidc-optional)
  - [Security alerting](#security-alerting-optional)
  - [Production-only variables](#production-only-variables)
- [Step 3: Start the stack](#step-3-start-the-stack)
  - [Secrets management](#secrets-management)
  - [Reverse proxy](#reverse-proxy)
- [Step 4: Register and log in](#step-4-register-and-log-in)
- [Step 5: Create a project and invite your team](#step-5-create-a-project-and-invite-your-team)
- [Step 6: Verify email](#step-6-verify-email-if-smtp-is-configured)
- [What's next?](#whats-next)

---

## Prerequisites

- **Docker Engine 24+** and **Docker Compose v2** (`docker compose`, not `docker-compose`)
- For production: a domain name with an A record pointing to your server, and ports 80/443 open

---

## Step 1: Clone the repository

```bash
git clone https://github.com/esbeneickhardt/Planly.git
cd Planly
```

---

## Step 2: Create and configure your `.env` file

```bash
cp .env.example .env
```

Open `.env` in your editor. The sections below explain every variable. Work through them top to bottom: required ones first, then optional ones as needed.

> The `.env` file is the right approach for local development and single-server setups. For teams and CI/CD pipelines, see [Secrets management](#secrets-management) in Step 3.

---

### Required: the app will not start without these

| Variable | Description | How to set |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL password | Any strong random string |
| `JWT_SECRET` | JWT signing key (min 32 chars) | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256-GCM key for secrets stored in the database | `openssl rand -hex 32` |
| `ADMIN_EMAIL` | The account that registers with this email becomes the server owner (superadmin). | Your email address |
| `UPLOADS_DIR` | Directory where file uploads are stored. Use an absolute path in production. Skip this if you are using S3-compatible storage - see [File storage](#file-storage) below. | e.g. `/home/planly/data/uploads` |

Generate the two secrets in one go:

```bash
openssl rand -hex 32   # copy result → JWT_SECRET
openssl rand -hex 32   # copy result → ENCRYPTION_KEY
```

> **Keep `ENCRYPTION_KEY` safe.** It encrypts webhook secrets and SMTP passwords in the database. If you lose it those values become unreadable. Back it up separately from the database.

---

### File storage

By default Planly stores uploads on the local filesystem at `UPLOADS_DIR`. This works fine in production when backed by a mounted volume. Files persist across container recreations. Use S3-compatible storage instead if you prefer not to manage disk space on the host, or if you run multiple backend instances. Set `S3_BUCKET` to enable it; when set, `UPLOADS_DIR` is ignored.

**Self-hosted MinIO**
```env
S3_BUCKET=planly
S3_REGION=us-east-1
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=planly
S3_SECRET_ACCESS_KEY=changeme
```

**Scaleway Object Storage**
```env
S3_BUCKET=planly-uploads
S3_REGION=nl-ams-1
S3_ENDPOINT=https://s3.nl-ams.scw.cloud
S3_ACCESS_KEY_ID=<access key id>
S3_SECRET_ACCESS_KEY=<secret key>
```

**AWS S3**
```env
S3_BUCKET=planly-uploads
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

---

### Admin account

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | random (printed to logs) | Initial password for the admin account. If omitted, a random password is generated and printed to the container logs on first start. |

---

### App settings

These have sensible defaults for local development. Review them before going to production.

| Variable | Default | Description |
|---|---|---|
| `FRONTEND_ORIGIN` | `http://localhost:80` | The URL browsers use to reach the app. Must exactly match the `Origin` header: used for CORS and CSRF validation. Change to your public domain in production (e.g. `https://planly.yourdomain.com`). |
| `APP_URL` | same as `FRONTEND_ORIGIN` | Base URL used in outgoing email links (password reset, invites). Set to your public domain in production. |
| `PORT` | `3000` | Backend listen port inside the Docker network. No need to change unless you have a port conflict. |
| `COOKIE_SECURE` | `true` | Adds the `Secure` flag to session cookies. Keep `true` when serving over HTTPS. Set to `false` if the backend only sees plain HTTP (e.g. a reverse proxy terminates TLS before Planly). `localhost` is always treated as secure by browsers so this has no effect in local development. |
| `TRUSTED_PROXY_DEPTH` | `1` | Number of trusted reverse-proxy hops. Used to read the real client IP from `X-Forwarded-For`. `1` for the default Nginx in the dev compose file. `0` if exposing the backend directly. |
| `LOG_LEVEL` | `info` | Fastify log level: `trace` · `debug` · `info` · `warn` · `error` · `fatal` |
| `ADMIN_LOG_RETENTION_DAYS` | `90` | Days of admin audit logs to keep. Older entries are pruned nightly. |
| `METRICS_SECRET` |: | When set, the `GET /api/metrics` endpoint requires an `X-Metrics-Secret: <value>` header. When unset the endpoint returns 401 to everyone: it is never public. |

---

### Email / SMTP (optional but recommended)

Without SMTP, emails (invites, password reset, @mention notifications) are printed to the container logs instead of sent. You can also configure this later inside the Admin UI without restarting.

**Preferred: Admin UI:** Admin panel → **Email Settings** → fill in credentials → **Save**. Credentials are stored encrypted in the database.

**Alternative: environment variables** (requires restart when changed):

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` |: | SMTP server hostname, e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | TLS mode. Both options are encrypted. `false` = STARTTLS on port 587 (standard, used by Gmail / SendGrid / Mailgun). `true` = implicit TLS on port 465 (SMTPS). |
| `SMTP_USER` |: | SMTP authentication username |
| `SMTP_PASS` |: | SMTP authentication password or app password |
| `SMTP_FROM` | `Planly <noreply@planly.app>` | From address on outgoing emails |

Common providers:

| Provider | Host | Port | Notes |
|---|---|---|---|
| Gmail | `smtp.gmail.com` | `587` | Use an [App Password](https://myaccount.google.com/apppasswords), not your account password |
| Microsoft 365 | `smtp.office365.com` | `587` | STARTTLS |
| SendGrid | `smtp.sendgrid.net` | `587` | Username: `apikey`, password: your API key |
| Mailgun | `smtp.mailgun.org` | `587` | |

> Store `SMTP_PASS` in `.env`, never directly in `docker-compose.yml`. `.env` is gitignored.

---

### SSO / OIDC (optional)

Adds a "Sign in with \<provider\>" button on the login page. Works with any OpenID Connect provider.

First, register an OAuth2 app with your provider and set the redirect URI to:
```
https://planly.yourdomain.com/api/auth/sso/callback
```

Then add to `.env`:

| Variable | Description |
|---|---|
| `OIDC_ISSUER` | Provider issuer URL (see table below) |
| `OIDC_CLIENT_ID` | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | OAuth2 client secret |
| `OIDC_PROVIDER_NAME` | Label for the login button (default: `SSO`) |
| `OIDC_SCOPES` | Space-separated scopes (default: `openid email profile`) |

Common issuers:

| Provider | `OIDC_ISSUER` |
|---|---|
| Google | `https://accounts.google.com` |
| Microsoft Entra | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Auth0 | `https://<tenant>.auth0.com` |
| Okta | `https://<tenant>.okta.com` |
| Keycloak | `https://<host>/realms/<realm>` |

---

### Security alerting (optional)

| Variable | Description |
|---|---|
| `SECURITY_ALERT_WEBHOOK_URL` | POST endpoint for high-severity security events: `LOGIN_LOCKED`, `ADMIN_GRANTED`, `ADMIN_REVOKED`, `CROWN_TRANSFERRED`, `TOTP_DISABLED`, `PASSWORD_RESET_BY_ADMIN`. Accepts Slack incoming webhooks, Discord webhooks, or any JSON HTTP endpoint. |

---

### Production-only variables

Only needed with `docker-compose.prod.yml`:

| Variable | Description |
|---|---|
| `DOMAIN` | Your public hostname, e.g. `planly.yourdomain.com` |
| `ACME_EMAIL` | Email address for Let's Encrypt certificate notifications |
| `BACKUP_DIR` | Host path for automated database and upload backups (default: `./backups`) |

---

## Step 3: Start the stack

### Development (HTTP, localhost)

```bash
docker compose up --build
```

This starts PostgreSQL, the Fastify backend, and the React frontend behind Nginx. Open [http://localhost](http://localhost).

The first build takes 2–3 minutes. Subsequent starts are fast.

### Production (HTTPS, your domain)

Make sure `DOMAIN`, `ACME_EMAIL`, and your other production variables are set in `.env`, then:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Traefik obtains and renews a Let's Encrypt certificate automatically. Open `https://planly.yourdomain.com`.

Check the certificate was issued (may take 30–60 seconds on first start):

```bash
docker compose -f docker-compose.prod.yml logs traefik
```

### Secrets management

The `.env` file works fine for a single server. For production deployments with a team there are better approaches:

**Option 1 - .env file on the server (simplest)**

Keep `.env` at a fixed path on the server, never in the repository or alongside database backups. Restrict permissions so only root can read it:

```bash
chmod 600 /srv/planly/.env
```

**Option 2 - CI/CD injection**

Docker Compose reads variables from the shell environment as well as from `.env`. Inject secrets at deploy time without any file on disk:

```bash
# GitHub Actions example (secrets set in repo settings)
DB_PASSWORD=${{ secrets.DB_PASSWORD }} \
JWT_SECRET=${{ secrets.JWT_SECRET }} \
ENCRYPTION_KEY=${{ secrets.ENCRYPTION_KEY }} \
ADMIN_EMAIL=${{ secrets.ADMIN_EMAIL }} \
docker compose -f docker-compose.prod.yml up --build --force-recreate -d
```

**Option 3 - Secrets manager (recommended for teams)**

Tools like [Doppler](https://doppler.com), HashiCorp Vault, or 1Password Secrets Automation inject secrets as environment variables at runtime - nothing is stored on disk:

```bash
doppler run -- docker compose -f docker-compose.prod.yml up --build --force-recreate -d
```

**What to never do**

- Never commit `.env` to the repository (it is gitignored by default)
- Never put plaintext secrets in `docker-compose.yml`
- Never store `ENCRYPTION_KEY` in the same place as the database backup - if both are compromised together, encrypted fields are exposed

### Reverse proxy

If you run Planly behind your own reverse proxy (Nginx, Caddy, etc.) instead of Traefik:

1. Proxy all traffic to the frontend container on port 80.
2. Proxy `/api/*` and `/docs/*` to the backend on port 3000 (internal network only).
3. Pass `X-Forwarded-For` and `X-Forwarded-Proto` headers.
4. Set `TRUSTED_PROXY_DEPTH` in `.env` to match the number of proxy hops (default `1`).
5. If the proxy terminates TLS and forwards plain HTTP to the backend, set `COOKIE_SECURE=false` - otherwise the `Secure` cookie flag causes instant logouts.

---

## Step 4: Register and log in

1. Navigate to your Planly URL.
2. Click **Register** and create an account using the same email as `ADMIN_EMAIL`.
3. You will be logged in and land on the home screen.

If you set `ADMIN_EMAIL`, a shield icon button appears in the top bar (top-right, next to the notification bell) - click it to enter the admin panel, where you manage users, SMTP, announcements, and server configuration. Inside the admin panel's **Ownership** tab, the founding admin (the "crown" holder) is shown with a crown icon.

> **No `ADMIN_EMAIL` set?** The first registered user does not automatically become admin. Set `ADMIN_EMAIL` in `.env`, restart the stack, and admin rights are granted on startup if the account already exists.

By default, other users can see the list of projects you belong to on your profile card. To hide it, click your avatar (top-right) → **Privacy**, and turn off **Show my projects on my profile**. This only affects what other users see on your profile - it does not change your own access to anything.

---

## Step 5: Create a project and invite your team

1. Click the project picker in the top bar (your active project's emoji and name, top-right) → **New project** (or load the example projects from the welcome screen).
2. Give the project a name, icon, and deadline.
3. Open the project → **Settings** → **Team** → **Invite** to add team members by email or shareable link.
4. Use **Settings** → **Permissions** to control which views each role can access.

The project picker groups your projects by status: active projects are listed first, and any completed or archived projects collapse into a **Completed & archived (N)** section below them so they don't clutter the list - click it to expand.

By default, any team member can find your project via search and add themselves. To turn that off, open **Settings** → **General** → **Project search visibility** and toggle it to **Hidden from project search** (owner-only).

On the **Tasks** (Backlog) view, click the status pill on any row to change a task's status directly from the table, without opening the task.

---

## Step 6: Verify email (if SMTP is configured)

Send a test email to confirm delivery:

Admin panel → **Email Settings** → **Send test**.

If the test fails, check `SMTP_HOST`, `SMTP_PORT`, and `SMTP_PASS` in `.env` and confirm your provider allows SMTP access (some require app passwords or explicit SMTP enablement).

---

## What's next?

- [Administration](Administration.md): user management, announcements, audit log
- [Access Tokens](Access-Tokens.md) + [API Reference](API-Reference.md): automate Planly with the REST API
- [Webhooks](Webhooks.md): connect Planly to external services
- [Development](Development.md): running the app outside Docker, architecture overview, contributing
