# 02 - Repository & Documentation

← [Back to index](README.md)

> **Code references**
> - [README.md](../../README.md) - public-facing project description, quick start, tech stack
> - [CONTRIBUTING.md](../../CONTRIBUTING.md) - dev setup, test commands, deploy workflow, code conventions
> - [DECISIONS.md](../../DECISIONS.md) - architectural decisions (Fastify, Prisma, httpOnly cookies, tokenVersion)
> - [DEPLOYMENT.md](../../DEPLOYMENT.md) - production deployment guide, migration steps, backup/restore
> - [SECURITY.md](../../SECURITY.md) - RBAC table, CSRF layers, encryption-at-rest list, reporting email
> - [LICENSE](../../LICENSE) - custom license with commercial-sale, competing-product, AI-training restrictions
> - [docs/wiki/](../../docs/wiki/) - user-facing wiki pages (Configuration, API-Reference, Webhooks, Security…)
> - [frontend/public/](../../frontend/public/) - public assets, icon directories

Read every file listed here and confirm it is accurate, complete, and ready for a public audience.

---

## Root-level files

### README.md
- [ ] Title and tagline make sense for an open-source first-time visitor
- [ ] "Philosophy" section accurately describes the product
- [ ] All listed features actually exist and work
- [ ] Quick Start commands are correct and produce a working app
- [ ] Environment variable table matches `.env.example`
- [ ] Documentation table links are all valid (no 404s)
- [ ] Tech stack table is accurate
- [ ] License section matches the actual LICENSE file
- [ ] `docs/screenshots/` placeholder notice is removed or real screenshots are added
- [ ] GitHub URL `https://github.com/EsbenEickhardt/planly.git` is correct and public

### LICENSE
- [ ] Copyright year and holder name are correct (`2026 Esben Eickhardt`)
- [ ] "COMMERCIAL SALE" restriction is clearly worded
- [ ] "COMPETING PRODUCT" restriction is clearly worded
- [ ] "AI TRAINING" restriction is clearly worded
- [ ] Redistribution terms allow self-hosting without charge
- [ ] Contact email in LICENSE is valid and monitored

### SECURITY.md
- [ ] Reporting email `security@planly.app` exists or is redirected to your inbox
- [ ] 48-hour acknowledgement pledge is realistic for a solo project
- [ ] RBAC table matches actual implementation (see [22-access-control.md](22-access-control.md))
- [ ] Tab permission matrix matches `SECURITY.md` vs actual default grants
- [ ] "Accepted Risks" table is current - TOTP note says "No TOTP MFA yet" but TOTP IS implemented - **update this**
- [ ] AES-256-GCM encryption section accurately describes what is encrypted
- [ ] Last-updated date reflects the current release date

### CONTRIBUTING.md
- [ ] Prerequisites (Docker, Node.js 20+) are correct
- [ ] `docker compose up --build` command works
- [ ] `npm ci --ignore-scripts` works in `backend/` and `frontend/`
- [ ] Test instructions (`TEST_DATABASE_URL=... npm test`) work
- [ ] Code conventions match actual codebase patterns
- [ ] "Adding a new backend route" steps match `src/index.ts` and `helpers/app.ts`
- [ ] Deploy instructions (`build --no-cache` + `up --force-recreate`) are correct
- [ ] DECISIONS.md link is valid

### DECISIONS.md
- [ ] Decision 1 (Fastify) accurately describes current usage
- [ ] Decision 2 (Prisma `db push`) - note this uses migrations in production? Verify against `DEPLOYMENT.md`
- [ ] Decision 3 (httpOnly cookies) is accurate
- [ ] Decision 4 (tokenVersion) is accurate
- [ ] All decisions still reflect the current architecture

### DEPLOYMENT.md
- [ ] "Always use `docker-compose.prod.yml` in production" warning is prominent
- [ ] Required environment variable table matches `.env.example`
- [ ] "PII Migration" section is present and instructions work
- [ ] `npx prisma migrate deploy` vs `prisma db push` - **CONTRIBUTING.md says `db push`, DEPLOYMENT.md says `migrate deploy`** - reconcile these
- [ ] Backup and restore section (if present) is accurate

### .env.example
- [ ] All three required variables (`DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`) are present with `changeme` placeholders
- [ ] `COOKIE_SECURE` commented out with clear dev note
- [ ] `ADMIN_EMAIL` is documented
- [ ] `SECURITY_ALERT_WEBHOOK_URL` is documented
- [ ] `METRICS_SECRET` is documented
- [ ] SMTP section is complete with common provider examples
- [ ] OIDC section covers Google, Microsoft, Auth0 examples
- [ ] `ENCRYPTION_KEY` rotation note is present
- [ ] No real secrets accidentally committed

---

## Wiki (`docs/wiki/`)

### Home.md
- [ ] All links to other wiki pages resolve
- [ ] Quick Reference commands are accurate

### Getting-Started.md
- [ ] Step 1-5 are correct end-to-end
- [ ] Health check endpoint URL is correct (`GET /api/health`)
- [ ] First login section describes ADMIN_EMAIL behavior accurately

### Configuration.md
- [ ] All env vars listed actually exist in `backend/src/index.ts` or `backend/src/config.ts`
- [ ] Default values are correct
- [ ] SMTP section covers all four providers (Gmail, M365, SendGrid, Mailgun)
- [ ] SSO/OIDC section is accurate
- [ ] IP restrictions section (if present) is accurate

### Deployment.md
- [ ] Dev vs production distinction is clear
- [ ] HSTS warning is prominent
- [ ] Update procedure (`build --no-cache` + `force-recreate`) is correct
- [ ] Backup/restore instructions are accurate

### User-Guide.md
- [ ] All view names (Kanban, Backlog, Gantt, Canvas) are correct
- [ ] Task creation, editing, and deletion steps are accurate
- [ ] Search, notifications, and calendar export sections present and accurate

### API-Reference.md
- [ ] Auth endpoint examples work with the running app
- [ ] CSRF header requirement is documented for cookie-based calls
- [ ] Bearer token requirement is documented for API clients
- [ ] Response examples match actual API responses
- [ ] At least one example per major resource type (task, product, team, user)

### Webhooks.md
- [ ] Event catalog is complete and accurate (compare to [19-webhooks.md](19-webhooks.md))
- [ ] Signature verification example is correct (HMAC-SHA256)
- [ ] Payload format matches what the server actually sends

### Access-Tokens.md
- [ ] PAT creation steps work
- [ ] App Registration steps work
- [ ] Scoping behavior description matches [22-access-control.md](22-access-control.md)
- [ ] "Token shown once only" warning is present

### Administration.md
- [ ] All admin panel sections are listed
- [ ] Audit log action table is complete
- [ ] Whitelist and lockout unlock procedures are accurate

### Security.md
- [ ] Authentication model description is accurate
- [ ] CSRF protection layers are accurately described
- [ ] TOTP section is accurate
- [ ] Progressive lockout table matches actual thresholds
- [ ] Encryption-at-rest list is complete (webhooks, SMTP, TOTP secrets)

### Development.md
- [ ] Local dev setup works
- [ ] Test commands work
- [ ] Architecture overview is current

---

## Public assets

### `frontend/public/README.md`
- [ ] Table is accurate (favicon, icons/projects/, icons/avatars/)
- [ ] Paths are correct

### `frontend/public/icons/projects/README.md`
- [ ] Description is clear for contributors
- [ ] At least a few default project icons exist in the directory

### `frontend/public/icons/avatars/README.md`
- [ ] Description is clear
- [ ] At least a few default avatar icons exist in the directory

### `frontend/dist/README.md` and icon READMEs
- [ ] These are identical copies of the public/ ones - acceptable or should they be removed from git?

---

## docker-compose files

### docker-compose.yml (dev)
- [ ] Service names are correct (`db`, `backend`, `frontend`)
- [ ] All required environment variables are mapped from `.env`
- [ ] Volume `db_data` is defined; uploads use a bind mount (`./data/uploads:/data/uploads`), not a named volume
- [ ] Backend healthcheck absent (frontend has port mapping, backend does not expose ports to host)
- [ ] Logging limits (`max-size: 50m`, `max-file: 5`) are present on backend

### docker-compose.prod.yml
- [ ] Traefik is configured correctly
- [ ] TLS labels are present on the frontend service
- [ ] HSTS header is present in Nginx config
- [ ] Backend is not exposed directly to the internet

### docker-compose.test.yml
- [ ] Purpose is clear - used for CI integration tests
- [ ] Postgres service is present with correct credentials

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
