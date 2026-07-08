# Security

This document covers the security model and all security features in Planly.

---

## Authentication Model

### Session-based (web app)

Login issues two cookies:

| Cookie | `httpOnly` | Description |
|---|---|---|
| `token` | Yes | 7-day JWT signed with HS256 and `JWT_SECRET`. The browser can't read it — only sent automatically with requests. |
| `csrf` | No | 24-byte random value. The browser CAN read it, and must echo it as `X-CSRF-Token` on every mutating request. |

Both cookies are `SameSite=Lax` and `Secure` (HTTPS-only) in production.

### Token-based (API clients)

PATs and App Registration tokens are stored as SHA-256 hashes in the database. The raw token value is only returned at creation. Requests use `Authorization: Bearer <token>`.

### Session Invalidation

Each user has a `tokenVersion` integer. When a user changes their password, resets it, or an admin forces a logout, this counter is incremented. Every cookie-based request validates that the JWT's embedded `tokenVersion` matches the current value in the database — a mismatch instantly invalidates the session without maintaining a blocklist.

### Email Verification

When enabled (`requireEmailVerification: true` in Server Config), users must verify their email before accessing the app. Verification tokens expire after 24 hours.

---

## CSRF Protection

Two layers, applied to all state-mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`):

**Layer 1 — Origin header check (browser requests):**  
If an `Origin` header is present, it must match `FRONTEND_ORIGIN`. Mismatches are rejected with `403 CSRF check failed: origin not allowed`.

**Layer 2 — Double-submit cookie (sessionful requests without an Origin header):**  
If the request has a session cookie but no Origin header, the `X-CSRF-Token` header must match the `csrf` cookie value. A mismatch is rejected with `403 CSRF check failed`.

Bearer token requests are exempt from CSRF checks entirely — API clients are not subject to CSRF attacks.

---

## Two-Factor Authentication (TOTP)

Users can enable TOTP in Settings → Security. Implementation:

- Standard TOTP (RFC 6238), 30-second window, SHA-1 HMAC (compatible with all authenticator apps)
- The TOTP secret is stored AES-256-GCM encrypted in the database
- Login flow: password check → if TOTP enabled, issue a 5-minute `mfa_challenge` JWT → `POST /api/auth/totp/challenge` with the 6-digit code → full session cookie issued
- The `mfa_challenge` JWT cannot access any other endpoints

---

## SSO / OpenID Connect

Any OpenID Connect provider is supported. Implementation:

- Uses PKCE (Proof Key for Code Exchange, RFC 7636) — `code_challenge` + `code_verifier` pair generated on authorize
- Uses a `nonce` claim to bind the ID token to the authorization request
- OAuth2 state + code verifier stored in the `SsoState` database table (not in-memory) — multi-replica safe
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

The `loginLockCount` counter on the user row tracks how many times the account has been locked. It resets to `0` on successful login. Admins can unlock accounts immediately from the Admin panel (also resets `loginLockCount`).

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

## IP Restrictions

Configurable via Admin → IP Restrictions.

- **Allowlist mode** — only requests from listed CIDRs are allowed; all others get `403 IP_BLOCKED`
- **Blocklist mode** — requests from listed CIDRs are denied; all others are allowed
- Supports both IPv4 and IPv6 CIDR notation
- Client IP is read from `X-Forwarded-For`, respecting `TRUSTED_PROXY_DEPTH` to skip trusted proxy IPs
- Localhost is always allowed regardless of mode
- The admin IP restrictions endpoint is always exempt (so admins can always recover from misconfiguration)

---

## WebSocket Security

WebSocket connections are authenticated via one of three methods:

1. **Cookie JWT** (preferred for browser clients) — the `token` cookie is sent automatically on the WebSocket upgrade request
2. **One-time ticket** (`?ticket=<token>`) — a 30-second single-use token issued via `POST /api/products/:productId/ws-ticket`. The full session JWT never appears in a URL query string (which would be logged by servers and proxies). Tickets are stored in the database — multi-replica safe.
3. **API PAT** (`?token=<pat>`) — for server-to-server streaming consumers. Session JWTs must NOT be passed here.

After authentication, the backend verifies the user is a member of the team that owns the requested product before joining the WebSocket room.

A per-user connection limit (`canJoin()` in the realtime manager) prevents connection storms.

---

## Content Security Policy (CSP)

HTML responses include a CSP header:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
object-src 'none'
```

The `object-src 'none'` directive prevents Flash and similar plugin content.

---

## Security Headers

Set via `@fastify/helmet`:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (2-year HSTS with preload)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 0` (modern browsers don't use it; disabled to avoid bugs)

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
   - Loopback: `127.0.0.0/8`
   - Private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-local: `169.254.0.0/16`, `fe80::/10`
   - Carrier-grade NAT: `100.64.0.0/10`
   - Multicast: `224.0.0.0/4`
   - IPv6 private: `fc00::/7`, `::1`

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
