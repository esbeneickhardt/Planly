# 04 - Authentication & Accounts

← [Back to index](README.md)

---

## Registration (`POST /api/users` / UI)

> Code: [routes/auth.ts](../../backend/src/routes/auth.ts) · [RegisterPage.tsx](../../frontend/src/pages/RegisterPage.tsx) · [server-config.ts](../../backend/src/utils/server-config.ts) (`requireWhitelist` default)

- [X] Register with valid email, username, password → redirected to app (verified in [01-setup.md](01-setup.md))
- [X] Register with duplicate email → clear error "Email already in use"
- [X] Register with duplicate username → clear error "Username already taken"
- [X] Register with invalid email format → form validation error
- [X] Register with password < 8 chars → form validation error
- [X] Empty form submit → field-level validation errors, not a 500
- [X] Username with special characters (spaces, `@`, `/`) → rejected or sanitised
- [X] Very long email (300+ chars) → rejected gracefully
- [X] If `requireWhitelist` is on: register with non-whitelisted email → rejected with clear message
- [X] If `requireWhitelist` is on: register with whitelisted email → succeeds

```bash
# API registration (tosAccepted is required)
curl -s -X POST $BASE/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"api_test@example.com","username":"api_test","password":"Str0ngPass!","tosAccepted":true}' | jq .
```

- [X] Returns 201 with success message
- [X] Returns 409 on duplicate email/username

---

## Login (`POST /api/auth/login`)

> Code: [routes/auth.ts](../../backend/src/routes/auth.ts) · [middleware/auth.ts](../../backend/src/middleware/auth.ts) (cookie flags, tokenVersion) · [middleware/csrf.ts](../../backend/src/middleware/csrf.ts) (csrf cookie set on login) · [LoginPage.tsx](../../frontend/src/pages/LoginPage.tsx)

- [X] Login with email → session cookie set, redirected to app
- [X] Login with username → session cookie set
- [X] Wrong password → 401 with "Invalid credentials" (no hint about which field)
- [X] Non-existent email → same 401 (no user enumeration)
- [X] Missing password field → 400 validation error
- [X] Empty password field → 401 (not a 500)
- [X] Both `token` (httpOnly) and `csrf` (readable) cookies are set — verified from [auth-cookie.ts](../../backend/src/utils/auth-cookie.ts)
- [X] `token` cookie has `HttpOnly` flag
- [X] `csrf` cookie does NOT have `HttpOnly` flag
- [X] Both cookies have `SameSite=Lax` attribute
- [X] In production (HTTPS), both cookies have `Secure` flag (`COOKIE_SECURE` env var, defaults to `true`)

---

## GET /api/auth/me

> Code: [routes/auth.ts](../../backend/src/routes/auth.ts) · select confirmed from code; `passwordHash` is absent from the select

- [X] Returns correct user fields: `id`, `username`, `email`, `isAdmin`, `isFoundingAdmin`, `emailVerified`, `avatarEmoji`, `avatarUrl`, `realName`, `phone`, `mustChangePassword`, `notificationPreferences`, `acceptsInvites` — note: `totpEnabled` is NOT in /me (use `/api/auth/totp/status` instead)
- [X] Password hash is NOT included in response — confirmed from code, `passwordHash` absent from select
- [X] 401 if called without a session — confirmed by curl

---

## Session refresh (`GET /api/auth/refresh`)

> Code: re-signs JWT with fresh 7-day expiry; does NOT increment `tokenVersion`

- [X] Returns 200 and re-issues the `token` cookie (extending expiry) — confirmed from code
- [X] 401 if called without a session — confirmed by curl

---

## Logout (`POST /api/auth/logout`)

> Code: increments `tokenVersion` (invalidating all outstanding sessions) then clears both cookies

- [X] Returns 200 — confirmed from code (`reply.send({ ok: true })`)
- [X] Subsequent `GET /api/auth/me` with the same cookie returns 401 — confirmed from code (tokenVersion incremented, cookie cleared)
- [X] Clearing cookies in browser and refreshing shows login page

---

## Session invalidation (tokenVersion)

> Code: [middleware/auth.ts](../../backend/src/middleware/auth.ts) — `tokenVersion` on User; incremented on password change, reset, logout, and admin force-logout

- [X] Change password → existing session in second tab/window is immediately invalid on next request — confirmed from code (`tokenVersion` incremented + cookie re-issued in `change-password` route)
- [X] Admin forces logout (via admin panel) → target user's session is immediately invalid — confirmed from code (`PUT /api/admin/users/:id/force-logout` increments `tokenVersion`)
- [X] Reset password → all sessions invalidated — confirmed from code (`reset-password.ts` increments `tokenVersion` in transaction)

---

## Forgot password flow

> Code: [routes/password-reset.ts](../../backend/src/routes/password-reset.ts) · [ForgotPasswordPage.tsx](../../frontend/src/pages/ForgotPasswordPage.tsx) · [ResetPasswordPage.tsx](../../frontend/src/pages/ResetPasswordPage.tsx)

- [X] Enter a registered email → `{ ok: true }` — confirmed by curl
- [X] Enter an unregistered email → same `{ ok: true }` (no user enumeration) — confirmed by curl
- [X] Reset link cannot be used twice → 400 "Invalid or expired reset link" — confirmed from code (`usedAt` check)
- [X] Successful reset invalidates all sessions — confirmed from code (`tokenVersion: { increment: 1 }` in same transaction)
- [ ] Click "Forgot password?" on login page → success message shown
- [ ] Receive email with reset link (check logs if SMTP not configured)
- [ ] Click link → lands on reset password page
- [ ] Enter new password + confirm → success → redirected to login
- [ ] Log in with new password → works
- [ ] Old password rejected

---

## Email verification

> Code: [routes/password-reset.ts](../../backend/src/routes/password-reset.ts) (`verify-email`, `send-verification`, `resend-verification`)

When `requireEmailVerification` is enabled in Admin → Email:

- [X] Verification token is single-use — confirmed from code (`usedAt` check)
- [X] Verification token expires after 24 hours — confirmed from code (`expiresAt: now + 24h`)
- [ ] Newly registered user receives verification email
- [ ] Unverified user cannot log in → clear "Verify your email" error
- [ ] "Resend verification email" link on login page sends a new email
- [ ] Verification token in email → clicking it verifies the account
- [ ] After verification, login works

---

## TOTP / Two-factor authentication

> Code: [routes/totp.ts](../../backend/src/routes/totp.ts) · TOTP secret stored AES-256-GCM encrypted · [TotpModal.tsx](../../frontend/src/components/common/TotpModal.tsx)

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

---

## Progressive login lockout

> Code: [routes/auth.ts](../../backend/src/routes/auth.ts) · [AdminUsers.tsx](../../frontend/src/pages/admin/AdminUsers.tsx) (locked badge + unlock button)

- [X] Enter wrong password 5 times → "Too many failed attempts. Account locked for 15 minutes." (HTTP 429) — confirmed by curl on `api_test` user
- [X] Try again immediately → "Account temporarily locked. Try again in Xm." — confirmed by curl
- [ ] Admin panel → Users → locked user shows "Locked Xm" badge
- [ ] Admin clicks "Unlock" → badge disappears, correct password works immediately
- [ ] 2nd lockout (5 more failures after unlock) → 1 hour
- [ ] 3rd lockout → 24 hours
- [ ] `SECURITY_ALERT_WEBHOOK_URL` fires on lockout (if configured)

---

## Password change (`POST /api/auth/change-password`)

> Code: [routes/auth.ts](../../backend/src/routes/auth.ts) — increments `tokenVersion`, invalidating all other sessions · [ChangePasswordPage.tsx](../../frontend/src/pages/ChangePasswordPage.tsx)

- [ ] Settings → Security → Change Password → enter current + new → works
- [ ] Wrong current password → 401 error
- [ ] New password too short → validation error
- [ ] After change: old sessions invalidated, current session works (re-login not required)

---

## SSO / OIDC

> N/A — OIDC env vars not configured on this instance. Skip.

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
