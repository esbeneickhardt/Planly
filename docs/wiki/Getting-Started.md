# Getting Started

This guide walks you from zero to a running Planly instance in under 10 minutes.

---

## Prerequisites

- **Docker Engine 24+** and **Docker Compose v2** (`docker compose` not `docker-compose`)
- A terminal and a text editor
- For production: a domain name with DNS pointing to your server, and ports 80/443 open

---

## Step 1 — Clone the repository

```bash
git clone https://github.com/EsbenEickhardt/planly.git
cd planly
```

---

## Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and set the three required secrets. Generate them with `openssl`:

```bash
openssl rand -hex 32   # run twice — once for JWT_SECRET, once for ENCRYPTION_KEY
```

Minimum `.env` for development:

```env
DB_PASSWORD=some-strong-password
JWT_SECRET=<64-char hex string>
ENCRYPTION_KEY=<64-char hex string>
ADMIN_EMAIL=you@example.com
```

`ADMIN_EMAIL` is optional but strongly recommended — whoever registers with that email becomes the founding admin with access to the `/admin` panel.

---

## Step 3 — Start the stack

### Development (HTTP, localhost)

```bash
docker compose up --build
```

This starts PostgreSQL, the Fastify backend, and the React frontend behind an Nginx reverse proxy. Open [http://localhost](http://localhost).

First run takes 2–3 minutes to build images. Subsequent starts are fast.

### Production (HTTPS, your domain)

Add two more variables to `.env`:

```env
DOMAIN=planly.yourdomain.com
ACME_EMAIL=you@yourdomain.com
```

Then:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Traefik obtains and renews a Let's Encrypt certificate automatically. Open `https://planly.yourdomain.com`.

---

## Step 4 — Register and log in

1. Navigate to your Planly URL.
2. Click **Register** and create an account using the same email as `ADMIN_EMAIL`.
3. You'll be logged in and land on the home screen.

If you set `ADMIN_EMAIL`, a crown icon appears next to your username and an **Admin** link appears in the sidebar. Click it to open the admin panel.

> **No `ADMIN_EMAIL` set?** The first registered user does not automatically become admin. Set `ADMIN_EMAIL` in `.env` and restart the stack — the backend grants admin on startup if the account already exists.

---

## Step 5 — Create a team and invite people

1. Click **New Team** in the sidebar.
2. Give the team a name and save.
3. Open the team settings → **Members** → **Invite**.
4. Either paste a link to share, or enter an email address to send a direct invitation.

---

## Step 6 — Configure email (optional but recommended)

Without SMTP, email features (invite emails, password reset, verification, @mention notifications) log to the container console instead of sending. To enable:

**Option A — Admin UI (preferred):**  
Admin panel → **Email** → fill in host, port, credentials → **Save**.  
Credentials are stored encrypted in the database.

**Option B — Environment variables:**  
Add to `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
```
Then reference them in `docker-compose.yml` (they're already wired up in the file, just needs the `.env` values filled).

---

## Step 7 — Configure SSO (optional)

To enable a "Sign in with Google" (or any OIDC provider) button:

1. Create an OAuth2 app with your provider. Set the redirect URI to:  
   `https://planly.yourdomain.com/api/auth/sso/callback`

2. Add to `.env`:
   ```env
   OIDC_ISSUER=https://accounts.google.com
   OIDC_CLIENT_ID=your-client-id
   OIDC_CLIENT_SECRET=your-client-secret
   OIDC_PROVIDER_NAME=Google
   ```

3. Restart the stack. The SSO button appears on the login page.

See [Configuration](Configuration.md#sso--oidc) for other providers.

---

## What's next?

- [Configuration](Configuration.md) — full environment variable reference
- [User Guide](User-Guide.md) — learn the views, tasks, and collaboration features
- [API Reference](API-Reference.md) — automate Planly with the REST API
- [Webhooks](Webhooks.md) — connect Planly to external services
