# Security

This document covers the security model and all security features in Planly.

---

## Contents

- [Authentication Model](#authentication-model)
- [CSRF Protection](#csrf-protection)
- [Two-Factor Authentication (TOTP)](#two-factor-authentication-totp)
- [SSO / OpenID Connect](#sso--openid-connect)
- [Progressive Account Lockout](#progressive-account-lockout)
- [Encryption at Rest](#encryption-at-rest)
- [Personal Data Export (GDPR)](#personal-data-export-gdpr)
- [IP Restrictions](#ip-restrictions)
- [WebSocket Security](#websocket-security)
- [Security Headers](#security-headers)
- [Rate Limiting](#rate-limiting)
- [Webhook SSRF Protection](#webhook-ssrf-protection)
- [Request ID Tracking](#request-id-tracking)
- [Responsible Disclosure](#responsible-disclosure)

---

## Authentication Model

### Session-based (web app)

Login issues three cookies:

| Cookie | `httpOnly` | Lifetime | Description |
|---|---|---|---|
| `token` | Yes | 1 hour | Short-lived JWT signed with HS256 and `JWT_SECRET`. Short lifetime limits the damage window if a token is stolen. |
| `csrf` | No | 30 days | Random 24-byte value. The browser CAN read it, and must echo it as `X-CSRF-Token` on every mutating request. |
| `refresh_token` | Yes | 30 days | Long-lived token, path-restricted to `/api/auth/refresh-token`. Used to silently reissue a new `token` JWT when it expires, so users stay logged in without re-entering credentials. |

Both cookies are `SameSite=Lax` and `Secure` (HTTPS-only) in production.

### Token-based (API clients)

PATs and App Registration tokens are stored as SHA-256 hashes in the database. The raw token value is only returned at creation. Requests use `Authorization: Bearer <token>`.

### Session Invalidation

Each user has a `tokenVersion` integer. When a user changes their password, resets it, or an admin forces a logout, this counter is incremented. Every cookie-based request validates that the JWT's embedded `tokenVersion` matches the current value in the database - a mismatch instantly invalidates all outstanding JWTs without maintaining a blocklist. The value is cached in memory for 10 seconds to reduce database round-trips.

### Email Verification

When enabled (`requireEmailVerification: true` in Server Config), users must verify their email before accessing the app. Verification tokens expire after 24 hours.

---

## CSRF Protection

Two layers, applied to all state-mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`):

**Layer 1 - Origin header check (browser requests):**  
If an `Origin` header is present, it must match `FRONTEND_ORIGIN`. Mismatches are rejected with `403 CSRF check failed: origin not allowed`.

**Layer 2 - Double-submit cookie (sessionful requests without an Origin header):**  
If the request has a session cookie but no Origin header, the `X-CSRF-Token` header must match the `csrf` cookie value. A mismatch is rejected with `403 CSRF check failed`.

Bearer token requests are exempt from CSRF checks entirely - API clients are not subject to CSRF attacks.

---

## Two-Factor Authentication (TOTP)

Users can enable TOTP from the account menu (click your avatar, top-right) → **Security (2FA)**, which opens the TOTP setup modal directly - there is no separate "Security" tab under a project's Settings. Implementation:

- Standard TOTP (RFC 6238), 30-second window, SHA-1 HMAC (compatible with all authenticator apps)
- The TOTP secret is stored AES-256-GCM encrypted in the database
- Login flow: password check → if TOTP enabled, issue a 5-minute `mfa_challenge` JWT → `POST /api/auth/totp/challenge` with the 6-digit code → full session cookie issued
- The `mfa_challenge` JWT cannot access any other endpoints
- Confirming setup also generates **8 one-time backup codes**, shown once. Each is a 10-character hex string (e.g. `A3F9C2E1B4`) that can be submitted in place of a 6-digit code if the authenticator device is unavailable; a code is consumed and invalidated the moment it's used, and codes are stored as bcrypt hashes, never in plaintext.

---

## SSO / OpenID Connect

Any OpenID Connect provider is supported. Implementation:

- Uses PKCE (Proof Key for Code Exchange, RFC 7636) - `code_challenge` + `code_verifier` pair generated on authorize
- Uses a `nonce` claim to bind the ID token to the authorization request
- OAuth2 state + code verifier stored in the `SsoState` database table (not in-memory) - multi-replica safe
- State entries expire after 10 minutes and are deleted on use
- On successful SSO login, Planly creates a local account (with `emailVerified: true`) if one doesn't exist for that email, or links to the existing account

---

## Progressive Account Lockout

Repeated failed logins trigger an escalating lockout:

| Failure count | Lockout duration |
|---|---|
| 1st lockout (5 failures) | 15 minutes |
| 2nd lockout | 1 hour |
| 3rd lockout | 24 hours |
| 4th+ lockout | 7 days |

The `loginLockCount` counter on the user row tracks how many times the account has been locked. It resets to `0` on successful login. Admins can unlock accounts immediately from the Admin panel's Users tab - this clears `failedLoginAttempts` and `loginLockedUntil` so the user can sign in right away, but deliberately does **not** reset `loginLockCount`. That counter is preserved on purpose, so the escalation schedule above keeps advancing across future incidents instead of quietly resetting to the 15-minute tier every time an admin intervenes.

A security alert webhook fires on lockout if `SECURITY_ALERT_WEBHOOK_URL` is set.

---

## Encryption at Rest

Sensitive values in the database are encrypted with AES-256-GCM:

- Webhook signing secrets
- SMTP passwords
- TOTP secrets

Key derivation uses HKDF (RFC 5869) with SHA-256, applying domain separation via the info string `planly-v1 aes-256-gcm-key`. The raw `ENCRYPTION_KEY` is never used directly as the cipher key.

Format stored in the database: `<ivHex>:<authTagHex>:<ciphertextHex>`.

The GCM authentication tag means tampered ciphertext is detected at decrypt time.

---

## Personal Data Export (GDPR)

Every user can download everything Planly holds about their account: click your avatar (top-right) → **Download my data**, which fetches `GET /api/me/export` and saves a JSON file. The export is rate-limited to 5 requests per hour and includes:

- Profile fields (with PII fields like `realName` decrypted before export)
- Tasks the user created, owns, or reviews
- Messages the user authored
- Notifications, API token metadata (names and expiry only, never secrets), announcements and comments authored, access requests, and team memberships

This satisfies data-portability requests under GDPR Article 20. See also [Operations → Project data export](Operations.md#backup-and-restore) for exporting a whole project's data (a separate, owner/co-owner-only endpoint).

---

## IP Restrictions

Configurable via Admin panel → **Networking** tab (the feature is referred to as "IP restrictions" throughout this doc, even though the tab itself is labeled "Networking"). There is no on/off mode switch - two independent rule sets are always active:

- **User rules** - apply to every non-admin request (all API traffic except `/api/admin/*`)
- **Admin rules** - apply only to `/api/admin/*` requests, checked inside `requireAdmin` in addition to (not instead of) the user rules

Each rule set has its own **allowlist** and **blocklist**, both active simultaneously:

- An empty allowlist means no allowlist filtering - everyone not blocked is allowed.
- A non-empty allowlist means only listed CIDRs are permitted.
- Blocklist entries are always denied, even if the same IP also matches the allowlist - **blocklist wins on conflict**.
- Requests denied by the user rules get `403 IP_BLOCKED`; requests denied by the admin rules get `403 ADMIN_IP_BLOCKED`.

Other behavior:

- Supports both IPv4 and IPv6 CIDR notation
- Client IP is read from `X-Forwarded-For`, respecting `TRUSTED_PROXY_DEPTH` to skip trusted proxy IPs
- Localhost (`127.0.0.1`, `::1`) always bypasses both rule sets
- A request authenticated as an admin (valid session cookie for a user with `isAdmin: true`) bypasses the user rule set entirely - only the admin rule set applies to them, and only on `/api/admin/*` routes
- The `/api/admin/ip-restrictions` and `/api/admin/admin-ip-restrictions` management endpoints are always exempt from both rule sets, so a misconfiguration can always be fixed from the admin panel

---

## WebSocket Security

WebSocket connections are authenticated via one of three methods:

1. **Cookie JWT** (preferred for browser clients) - the `token` cookie is sent automatically on the WebSocket upgrade request
2. **One-time ticket** (`?ticket=<token>`) - a 30-second single-use token issued via `POST /api/products/:productId/ws-ticket`. The full session JWT never appears in a URL query string (which would be logged by servers and proxies). Tickets are stored in the database - multi-replica safe.
3. **API PAT** (`?token=<pat>`) - for server-to-server streaming consumers. Session JWTs must NOT be passed here.

After authentication, the backend verifies the user is a member of the team that owns the requested product before joining the WebSocket room.

A per-user connection limit (`canJoin()` in the realtime manager) prevents connection storms.

---

## Security Headers

These are the headers that actually reach the browser for the web app, set by **Nginx** (`frontend/nginx.conf.template`), which serves the SPA and proxies `/api/*` through to the backend:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; report-uri /api/csp-report
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-DNS-Prefetch-Control: off
```

Notable points:
- `script-src 'self'` has **no** `'unsafe-inline'` - inline `<script>` tags are blocked; only same-origin script files execute. (`style-src` still allows inline styles, which the CSS-in-JS styling in this app relies on.)
- `frame-ancestors 'none'` together with `X-Frame-Options: DENY` stops the app from being embedded in an `<iframe>` anywhere, which defends against clickjacking.
- `report-uri /api/csp-report` sends browser-blocked CSP violations to a dedicated endpoint (no auth required, logged server-side at warn level) so real violations can be reviewed.
- `Strict-Transport-Security` is a 2-year HSTS policy with `preload`, so browsers force HTTPS for the domain (and subdomains) even before the first response arrives.

**The backend's own CSP header is a narrow fallback, not what browsers normally see.** Fastify registers `@fastify/helmet` with `contentSecurityPolicy: false`, and only injects a CSP header from an `onSend` hook when a response's `Content-Type` is `text/html` - which happens only for Fastify's own error pages, never for the JSON the API normally returns:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'
```

In every normal request/response cycle, the Nginx headers above are what protect the browser.

---

## Rate Limiting

Global rate limit: **200 requests per minute** per IP.

Stricter limits on sensitive endpoints:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 / minute |
| `POST /api/auth/forgot-password` | 10 / minute |
| `POST /api/auth/reset-password` | 10 / minute |
| `POST /api/auth/change-password` | 5 / 15 minutes |
| `POST /api/auth/resend-verification` | 5 / 15 minutes |

---

## Webhook SSRF Protection

Before persisting a webhook URL, Planly:

1. Validates the URL is `http://` or `https://`
2. Resolves the hostname via DNS
3. Blocks all private and reserved IP ranges:
   - Loopback: `127.0.0.0/8`, IPv6 `::1`
   - Private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-local: `169.254.0.0/16` (also covers the cloud metadata endpoint `169.254.169.254`), IPv6 `fe80::/10`
   - Carrier-grade NAT: `100.64.0.0/10`
   - "This network": `0.0.0.0/8`
   - Documentation/test ranges: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`
   - Broadcast and multicast/reserved: `255.255.255.255` and `224.0.0.0/3` (i.e. every address from `224.0.0.0` through `255.255.255.255` - a broader sweep than multicast alone, since it also catches the whole reserved/experimental Class E range)
   - IPv6 unique-local/reserved: `fc00::/7`, unspecified `::`, multicast `ff00::/8`, and IPv4-mapped loopback addresses (`::ffff:127.0.0.0/104`)

This prevents an attacker from registering a webhook that points to internal services (SSRF).

---

## Request ID Tracking

Every response includes an `X-Request-Id` header. If the client sends `X-Request-Id` in the request, that value is sanitized (control characters stripped, truncated to 64 chars) and used as-is, making it possible to correlate client-side errors with server logs.

---

## Responsible Disclosure

Found a security issue? Please email **esbeneickhardt@gmail.com** rather than opening a public GitHub issue. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

Please allow reasonable time for a fix before public disclosure.
