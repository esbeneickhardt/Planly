# Planly Security Audit

**Date:** July 5, 2026  
**Stack:** Fastify 4 + Prisma 5 + PostgreSQL 16  
**Method:** Manual code review of all backend routes, middleware, and utilities

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 3 |
| Medium | 7 |
| Low | 6 |
| **Total** | **17** |

---

## Critical

### C-1 — SMTP config writable by any authenticated user
**File:** `backend/src/routes/email-status.ts` · lines 28, 60

`PUT /api/email-config` and `DELETE /api/email-config` use `requireAuth` instead of `requireAdmin`. Any logged-in user can replace the server's SMTP credentials with their own, redirecting all password-reset tokens and invitation emails to an attacker-controlled mail server. This enables full account takeover for any user who resets their password after the SMTP has been poisoned.

**Fix:** Replace `requireAuth` with `requireAdmin` on both the `PUT` and `DELETE` handlers. Apply the same guard to `GET /api/email-config` to avoid leaking server hostname/credentials to non-admins.

---

## High

### H-1 — Stored XSS via SVG file upload
**Files:** `backend/src/utils/storage.ts` · line 40, `backend/src/routes/messages.ts` · line 27

`image/svg+xml` is in the allowed MIME types. SVG files are stored and served back with their original Content-Type, so an SVG containing a `<script>` tag executes in the browser when fetched from the API origin. The session cookie is `httpOnly` so direct token theft is blocked, but all API calls can be made on the victim's behalf.

**Fix:** Remove `image/svg+xml` from `ALLOWED_MIME_TYPES`, or serve SVGs with `Content-Type: text/plain` and `Content-Disposition: attachment` to force a download instead of browser rendering.

---

### H-2 — No HTTP security headers (Helmet not registered)
**File:** `backend/src/index.ts`

`@fastify/helmet` is not registered anywhere in the server setup. No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Referrer-Policy` headers are sent. Without `X-Content-Type-Options: nosniff`, browsers may MIME-sniff uploaded files. Without `X-Frame-Options`, the app can be framed for clickjacking attacks.

**Fix:** Register Helmet early in `main()`, before any route registration:
```ts
await app.register(import('@fastify/helmet'), { global: true })
```
Tune the CSP to match the frontend's React bundle, fonts, and API origin.

---

### H-3 — Auth rate limit never applied — onRoute hook fires too late
**File:** `backend/src/index.ts` · lines 207–214

The `onRoute` hook that caps auth endpoints at 10 req/min is registered after the auth routes are enqueued via `register()`. In Fastify's deferred plugin system, the hook fires too late — `/api/auth/login`, `/api/auth/forgot-password`, and `/api/auth/reset-password` all run under the global 200 req/min limit. The 5-attempt lockout partially compensates for login, but `forgot-password` has no lockout at all.

**Fix:** Move the `addHook('onRoute', ...)` call to before `app.register(authRoutes)`. Better: use Fastify's `config.rateLimit` route option declared inline on each handler.

---

## Medium

### M-1 — Session cookie missing the Secure flag
**Files:** `backend/src/routes/auth.ts` · line 69, `backend/src/routes/sso.ts` · line 129

Both login and SSO callback set the session cookie without `secure: true`. When the server is accessed over HTTP (direct access or misconfigured reverse proxy), the cookie transmits in cleartext and is interceptable by a passive network observer. `sameSite: 'lax'` does not protect against network sniffing.

**Fix:** Add `secure: true` to both `setCookie` calls. Gate it on `NODE_ENV !== 'production'` if HTTP is needed locally.

---

### M-2 — JWT sessions not invalidated on password change or reset
**File:** `backend/src/routes/password-reset.ts` · lines 67–71, 139–140

When a user changes or resets their password, all existing JWT cookies remain valid for their full 7-day lifetime. An attacker who has stolen a session cookie retains full access even after the victim resets their password — undermining the entire purpose of the reset flow.

**Fix:** Add a `tokenVersion` integer column to the `User` model. Embed it in the JWT at login. On password change/reset, increment it. In `requireAuth`, reject any token whose version doesn't match the current DB value.

---

### M-3 — MIME type accepted from client without content verification
**File:** `backend/src/routes/messages.ts` · lines 27–28

The upload handler trusts `data.mimetype` — the value declared by the client in the multipart request. An attacker can send HTML or JavaScript content while claiming a safe MIME type such as `image/png`. The server accepts and stores it as the declared type.

**Fix:** After reading the buffer with `data.toBuffer()`, use a magic-bytes library such as `file-type` to detect the true content type. Reject if it doesn't match the declared type or isn't in the allowlist.

---

### M-4 — No maximum password length — bcrypt DoS vector
**Files:** `backend/src/routes/users.ts` · line 40, `backend/src/routes/password-reset.ts` · line 55

Only a minimum length of 8 is enforced. bcrypt runs its full computation on the submitted input before truncating at 72 bytes. Submitting a multi-megabyte password string triggers a CPU-intensive bcrypt operation from a single unauthenticated HTTP request, enabling a denial-of-service attack.

**Fix:** Add before any call to `bcrypt.hash`:
```ts
if (password.length > 1024) return reply.status(400).send({ error: 'Password too long' });
```

---

### M-5 — API token exposed in WebSocket URL query parameter
**File:** `backend/src/routes/realtime.ts` · line 31

The WebSocket endpoint accepts a token via `?token=<value>` in the URL. Query parameters appear in server access logs, reverse proxy logs, browser history, and `Referer` headers. A token leaked from any of these sources grants persistent API access until expiry.

**Fix:** Prefer the cookie-based auth path (already supported as the first auth path). If the query-param path is required for non-browser clients, issue a short-lived single-use WS nonce via a separate authenticated endpoint and expire it on first use.

---

### M-6 — Uploaded files accessible and deletable by any authenticated user
**File:** `backend/src/routes/messages.ts` · lines 37–58

`GET /api/uploads/:filename` and `DELETE /api/uploads/:filename` require only `requireAuth`. Filenames are SHA-256 content hashes — anyone who observes a URL in a message can directly fetch or delete any uploaded file regardless of which project it belongs to. A read-only member of project A can access confidential attachments from project B.

**Fix:** Record the uploading user and associated `productId` in a DB table when a file is stored. In GET/DELETE handlers, verify the requesting user is a member of the product the file is associated with.

---

### M-7 — Discover endpoint leaks all server projects to any authenticated user
**File:** `backend/src/routes/access-requests.ts` · lines 8–22

`GET /api/products/discover` returns every project the current user isn't a member of — including name, description, deadline, emoji, team name, and owner username — with no access control. Any authenticated user can enumerate all projects on the server.

**Fix:** If the endpoint is intentional for the "request access" UX, return only public-facing metadata (name, emoji) rather than the full project object. If projects should be fully private, add an `isDiscoverable` flag and filter on it.

---

## Low

### L-1 — No rate limit on account registration
**File:** `backend/src/routes/users.ts` · line 26

`POST /api/users` falls under the global 200 req/min limit. An attacker can create thousands of accounts per minute — each triggering a DB write and optionally an email send.

**Fix:** Add a dedicated rate limit of 5–10 registrations per IP per hour via `@fastify/rate-limit` configured per-route on the registration handler.

---

### L-2 — API documentation publicly accessible without authentication
**File:** `backend/src/routes/docs.ts` · line 1148

`GET /api/docs` serves the full API reference — all endpoint paths, request body shapes, and role requirements — to unauthenticated visitors. This hands any attacker a complete map of the attack surface before they even have an account.

**Fix:** Add `{ preHandler: requireAuth }` to the docs route, or move the interactive playground behind auth while keeping a minimal public overview if external developers need it.

---

### L-3 — Sub-plan and column mutations bypass tab-permission checks
**Files:** `backend/src/routes/sprints.ts`, `backend/src/routes/columns.ts`

All write operations on sprints and columns check only `requireProductMember`, not `requireTabWrite`. A member with read-only access to all tabs can still create, edit, delete, and reorder sprints and columns — bypassing the per-tab RBAC model entirely.

**Fix:** Add tab-write checks to sprint mutations:
```ts
requireTabWrite(productId, userId, ['backlog'])
```
And to column mutations:
```ts
requireTabWrite(productId, userId, ['kanban'])
```

---

### L-4 — Raw SMTP error message returned to the client
**File:** `backend/src/routes/email-status.ts` · line 84

`reply.status(500).send({ error: (err as Error).message })` returns the raw exception message to the requesting user. SMTP errors often include server hostnames, TLS negotiation details, and SMTP command transcripts.

**Fix:** Log the full error server-side with `app.log.error(err)` and send only a generic client message:
```ts
reply.status(500).send({ error: 'Failed to send test email. Check server logs.' })
```

---

### L-5 — CSV formula injection in audit log export
**File:** `backend/src/routes/admin.ts` · lines 299–302

The CSV export embeds `actorName` and `targetName` (user-controlled usernames) directly into rows without stripping leading formula characters (`=`, `+`, `-`, `@`). An admin who registers with username `=HYPERLINK(...)` and exports the log in a spreadsheet application may trigger a formula. Blast radius is limited to admins only.

**Fix:** Before embedding each field, prefix values starting with `=`, `+`, `-`, or `@` with a single apostrophe — the standard CSV formula-injection defense.

---

### L-6 — avatarUrl accepts arbitrary URLs without scheme validation
**File:** `backend/src/routes/users.ts` · line 124

`PATCH /api/users/:id` accepts `avatarUrl` as any string with no length cap, scheme validation, or domain allowlist. `javascript:` scheme URLs or extremely long strings are stored and returned. If the frontend renders `avatarUrl` as an `href` or `src`, this could enable limited XSS or phishing.

**Fix:** Validate with `new URL(avatarUrl)` and restrict schemes to `https:` only. Add a max-length check of 2048 characters.

---

## What's already solid

- **Password hashing** — bcrypt at cost factor 12 throughout. Never stored, logged, or returned in any API response.
- **CSRF protection** — Origin-header check in `csrf.ts` combined with `SameSite=lax` cookies. Bearer-token callers are CSRF-immune by construction.
- **Admin endpoints double-gated** — Every `/api/admin/*` route uses `requireAdmin`, which re-fetches `isAdmin` from the DB on each request, not trusting the JWT payload alone.
- **No SQL injection** — All `$queryRaw` calls use Prisma tagged template literals, parameterized at the driver level. No raw string concatenation found.
