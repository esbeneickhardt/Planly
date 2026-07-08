# 04 — Authentication & Accounts

← [Back to index](README.md)

---

## Registration (`POST /api/users` / UI)

- [ ] Register with valid email, username, password → redirected to app
- [ ] Register with duplicate email → clear error "Email already in use"
- [ ] Register with duplicate username → clear error "Username already taken"
- [ ] Register with invalid email format → form validation error
- [ ] Register with password < 8 chars → form validation error
- [ ] Empty form submit → field-level validation errors, not a 500
- [ ] Username with special characters (spaces, `@`, `/`) → rejected or sanitised
- [ ] Very long email (300+ chars) → rejected gracefully
- [ ] If `requireWhitelist` is on: register with non-whitelisted email → rejected with clear message
- [ ] If `requireWhitelist` is on: register with whitelisted email → succeeds

```bash
# API registration
curl -s -X POST $BASE/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"api_test@example.com","username":"api_test","password":"Str0ngPass!"}' | jq .
```

- [ ] Returns 201 with success message
- [ ] Returns 409 on duplicate email/username

---

## Login (`POST /api/auth/login`)

- [ ] Login with email → session cookie set, redirected to app
- [ ] Login with username → session cookie set
- [ ] Wrong password → 401 with "Invalid credentials" (no hint about which field)
- [ ] Non-existent email → same 401 (no user enumeration)
- [ ] Missing password field → 400 validation error
- [ ] Empty password field → 401 (not a 500)

```bash
# Cookie login (save cookies for later curl tests)
curl -s -c cookies.txt -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | jq .

# Read CSRF token from cookies
CSRF=$(grep csrf cookies.txt | awk '{print $NF}')
```

- [ ] Both `token` (httpOnly) and `csrf` (readable) cookies are set
- [ ] `token` cookie has `HttpOnly` flag
- [ ] `csrf` cookie does NOT have `HttpOnly` flag
- [ ] Both cookies have `SameSite` attribute
- [ ] In production (HTTPS), both cookies have `Secure` flag

---

## GET /api/auth/me

```bash
curl -s -b cookies.txt $BASE/api/auth/me | jq .
```

- [ ] Returns correct user fields: `id`, `username`, `email`, `isAdmin`, `emailVerified`, `totpEnabled`, `avatarEmoji`
- [ ] Password hash is NOT included in response
- [ ] 401 if called without a session

---

## Session refresh (`GET /api/auth/refresh`)

```bash
curl -s -b cookies.txt -c cookies.txt $BASE/api/auth/refresh | jq .
```

- [ ] Returns 200 and re-issues the `token` cookie (extending expiry)
- [ ] Old cookie value is no longer valid after refresh (tokenVersion update)
- [ ] 401 if called without a session

---

## Logout (`POST /api/auth/logout`)

```bash
curl -s -b cookies.txt -c cookies.txt -X POST $BASE/api/auth/logout \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Returns 200
- [ ] Subsequent `GET /api/auth/me` with the same cookie returns 401
- [ ] Clearing cookies in browser and refreshing shows login page

---

## Session invalidation (tokenVersion)

- [ ] Change password → existing session in second tab/window is immediately invalid on next request
- [ ] Admin forces logout (via admin panel) → target user's session is immediately invalid
- [ ] Reset password → all sessions invalidated

---

## Forgot password flow

- [ ] Click "Forgot password?" on login page
- [ ] Enter a registered email → success message shown (no user enumeration)
- [ ] Enter an unregistered email → same success message (no user enumeration)
- [ ] Receive email with reset link (check logs if SMTP not configured)
- [ ] Click link → lands on reset password page
- [ ] Enter new password + confirm → success → redirected to login
- [ ] Log in with new password → works
- [ ] Old password rejected
- [ ] Reset link cannot be used twice → clear error

```bash
curl -s -X POST $BASE/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.local"}' | jq .
```

---

## Email verification

When `requireEmailVerification` is enabled in Admin → Email:

- [ ] Newly registered user receives verification email
- [ ] Unverified user cannot log in → clear "Verify your email" error
- [ ] "Resend verification email" link on login page sends a new email
- [ ] Verification token in email → clicking it verifies the account
- [ ] After verification, login works
- [ ] Verification token is single-use — second click shows "already verified" or "invalid token"
- [ ] Verification token expires after 24 hours — expired link shows clear error

```bash
# Trigger email verification send for currently logged-in user
curl -s -b cookies.txt -X POST $BASE/api/auth/send-verification \
  -H "X-CSRF-Token: $CSRF" | jq .

# Verify with token from email
curl -s -X POST $BASE/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token":"<token-from-email>"}' | jq .
```

---

## TOTP / Two-factor authentication

See also [23-security.md](23-security.md) for security checks.

- [ ] Settings → Security → "Enable 2FA" shows QR code
- [ ] Scan QR code in authenticator app (Google Authenticator, Authy, 1Password)
- [ ] Enter 6-digit code to confirm setup → TOTP enabled
- [ ] Log out → log in → TOTP challenge page appears
- [ ] Enter correct 6-digit code → session started
- [ ] Enter wrong code → rejected with clear error
- [ ] Wait for code to expire (30s), enter old code → rejected
- [ ] Enter backup code → session started
- [ ] Each backup code is single-use
- [ ] Settings → Security → "Disable 2FA" → enter current TOTP code → TOTP disabled
- [ ] After disabling, login no longer shows TOTP challenge

```bash
# Check TOTP status
curl -s -b cookies.txt $BASE/api/auth/totp/status | jq .

# Setup TOTP (returns QR code URL)
curl -s -b cookies.txt -X POST $BASE/api/auth/totp/setup \
  -H "X-CSRF-Token: $CSRF" | jq .

# Confirm TOTP after scanning
curl -s -b cookies.txt -X POST $BASE/api/auth/totp/confirm \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"code":"123456"}' | jq .
```

---

## Progressive login lockout

- [ ] Enter wrong password 5 times → "Account locked for 15 minutes" (HTTP 429)
- [ ] Try again immediately → shows minutes remaining
- [ ] Admin panel → Users → locked user shows "Locked Xm" badge
- [ ] Admin clicks "Unlock" → badge disappears
- [ ] After unlock, correct password works immediately
- [ ] 2nd lockout (5 more failures after previous reset) → 1 hour
- [ ] 3rd lockout → 24 hours
- [ ] `loginLockCount` resets to 0 on successful login
- [ ] `SECURITY_ALERT_WEBHOOK_URL` fires on lockout (if configured)

---

## Password change (`POST /api/auth/change-password`)

- [ ] Settings → Security → Change Password → enter current + new → works
- [ ] Wrong current password → 401 error
- [ ] New password same as current → rejected or accepted (document expected behaviour)
- [ ] New password too short → validation error
- [ ] After change: old sessions invalidated, current session works (re-login not required)

```bash
curl -s -b cookies.txt -X POST $BASE/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"currentPassword":"old","newPassword":"New!P@ss1"}' | jq .
```

---

## SSO / OIDC (skip if not configured)

- [ ] SSO button appears on login page only when OIDC env vars are set
- [ ] Clicking SSO button → redirected to provider
- [ ] After provider login → redirected back, session started
- [ ] First SSO login creates a local account with `emailVerified: true`
- [ ] Second SSO login with same email links to the existing account
- [ ] SSO user cannot set a password (no "Change Password" in Settings)
- [ ] State parameter prevents CSRF in OAuth flow (test by replaying a stale state)
- [ ] PKCE `code_verifier` is validated server-side

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
