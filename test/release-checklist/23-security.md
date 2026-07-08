# 23 — Security

← [Back to index](README.md)

---

## HTTP security headers

```bash
curl -sI $BASE/ | grep -iE "content-security|x-frame|x-content-type|strict-transport|referrer|permissions"
```

- [ ] `Content-Security-Policy` present and restrictive
  - `script-src 'self'` — NO `unsafe-inline` for scripts
  - `style-src` includes `'unsafe-inline'` (required by Tailwind — acceptable, documented in SECURITY.md)
  - `img-src 'self' data: blob:`
  - `connect-src 'self' ws: wss:`
  - `frame-ancestors 'none'` or `X-Frame-Options: DENY`
- [ ] `X-Content-Type-Options: nosniff` present
- [ ] `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` (or stricter)
- [ ] In production (`docker-compose.prod.yml`): `Strict-Transport-Security` header present

---

## Cookie security

```bash
curl -sI -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | grep -i set-cookie
```

- [ ] `token` cookie: `HttpOnly; SameSite=Lax; Path=/`
- [ ] `csrf` cookie: NOT HttpOnly; `SameSite=Lax`
- [ ] In production (HTTPS): both cookies have `Secure` flag
- [ ] `token` cookie expiry is ~7 days

---

## CSRF protection

```bash
# Test 1: mutating request without CSRF header (cookie session)
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}' | jq .
# Expected: 403 CSRF check failed

# Test 2: correct CSRF header
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"test2"}' | jq .
# Expected: 201

# Test 3: wrong CSRF value
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: wrongvalue123" \
  -d '{"name":"test3"}' | jq .
# Expected: 403

# Test 4: Origin mismatch
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.com" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"test4"}' | jq .
# Expected: 403 CSRF check failed: origin not allowed

# Test 5: Bearer token bypasses CSRF
curl -s -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -d '{"name":"PAT no CSRF needed"}' | jq .
# Expected: 201
```

- [ ] Test 1: 403 without CSRF header
- [ ] Test 2: 201 with correct CSRF header
- [ ] Test 3: 403 with wrong CSRF value
- [ ] Test 4: 403 with wrong Origin
- [ ] Test 5: 201 with Bearer token (no CSRF required)

---

## XSS prevention

```bash
# Create task with XSS payload in name
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"<script>window.__xss=1</script>"}' | jq '.name'
# Name should be stored and returned as literal text
```

- [ ] Task name with `<script>` stored as literal text; no script execution in browser
- [ ] Task description with `<img onerror="...">` does not fire the handler when rendered (ReactMarkdown blocks it)
- [ ] Chat message with `javascript:` href does not execute on click
- [ ] Announcement body with `<iframe>` not rendered as iframe in the browser
- [ ] Search results with special chars render safely
- [ ] CSP `script-src 'self'` blocks inline `<script>` injected via DOM

---

## SQL injection prevention

```bash
# SQL injection attempt in search
curl -s -b cookies.txt "$BASE/api/search?q='; DROP TABLE tasks; --" | jq .
# Expected: 200 with empty results or safe handling (NOT a 500)

# SQL injection in task name
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Robert'); DROP TABLE tasks; --\"}" | jq '.name'
# Expected: task created with literal name; no DB error
```

- [ ] SQL injection in search → safe (Prisma parameterizes all queries)
- [ ] SQL injection in task name → stored literally, no DB error
- [ ] SQL injection in any other string field → safe

---

## Rate limiting

```bash
# Hammer the login endpoint
for i in $(seq 1 12); do
  curl -s -X POST $BASE/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"nonexistent@test.com","password":"wrong"}' | jq .statusCode
done
```

- [ ] After 10 rapid login attempts → 429 Too Many Requests
- [ ] Registration endpoint rate limited (10/hour per IP)
- [ ] Other authenticated endpoints have reasonable rate limits

---

## Progressive lockout

(Also covered in [04-auth.md](04-auth.md))

- [ ] 5 failed logins → account locked 15 min
- [ ] Correct password while locked → rejected (lockout takes priority)
- [ ] Lockout escalates correctly on repeated events

---

## TOTP security

- [ ] TOTP secret stored encrypted in DB (AES-256-GCM); not plaintext
- [ ] Stale TOTP code (from previous 30s window) rejected
- [ ] Backup codes are single-use
- [ ] After TOTP is disabled, backup codes are deleted

---

## Token security

- [ ] PAT raw value returned ONLY at creation, never in subsequent GET
- [ ] PAT stored as SHA-256 hash; raw value not in database (verify if DB accessible)
- [ ] App registration tokens: same hash storage
- [ ] Webhook secrets: stored AES-256-GCM encrypted
- [ ] SMTP password: stored AES-256-GCM encrypted; not in GET response
- [ ] TOTP secret: stored AES-256-GCM encrypted

---

## IP restrictions

(Also covered in [05-admin.md](05-admin.md))

```bash
# Enable allowlist with only 127.0.0.1
# Then try from a different IP (or simulate with X-Forwarded-For)
curl -s -H "X-Forwarded-For: 1.2.3.4" $BASE/api/auth/me
# Expected: 403 if allowlist mode is active and 1.2.3.4 not in list
```

- [ ] Allowlist mode blocks requests from IPs not in the list
- [ ] Admin users are exempt from IP restrictions
- [ ] CIDR ranges work (e.g. `192.168.0.0/24`)

---

## Session invalidation

- [ ] Password change invalidates all other sessions (tokenVersion increment)
- [ ] Password reset invalidates all sessions
- [ ] Admin "force logout" invalidates the target user's sessions
- [ ] Token deletion does NOT require server restart to take effect

---

## Encryption at rest

- [ ] Webhook secret: `PATCH /webhooks/:id/rotate-secret` → encrypted in DB, raw returned once
- [ ] SMTP password: saved via admin UI → not returned in GET response
- [ ] TOTP secret: visible as encrypted blob in DB after TOTP setup
- [ ] `realName` stored encrypted: visible only to the user themselves and admins

---

## File upload security

- [ ] MIME type must match file extension (e.g. `.jpg` file with HTML content → rejected)
- [ ] Max file size limit enforced (50 MB — confirmed in SECURITY.md)
- [ ] Uploaded files not served with `text/html` Content-Type (prevents HTML injection via upload)
- [ ] File downloads require authentication

---

## Frontend security

- [ ] No sensitive data in `localStorage` or `sessionStorage` (no tokens)
- [ ] Auth token stored in httpOnly cookie only
- [ ] No API token in browser URL bar
- [ ] WS ticket used for WebSocket (not JWT in query param)

---

## Dependency vulnerabilities

```bash
cd /home/ebbemonster/Planly/backend && npm audit --audit-level=high
cd /home/ebbemonster/Planly/frontend && npm audit --audit-level=high
```

- [ ] No HIGH or CRITICAL vulnerabilities in backend dependencies
- [ ] No HIGH or CRITICAL vulnerabilities in frontend dependencies

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
