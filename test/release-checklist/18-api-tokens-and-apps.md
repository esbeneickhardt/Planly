# 18 - API Tokens & App Registrations

← [Back to index](README.md)

All tests require a running app and admin/member accounts from [01-setup.md](01-setup.md).

---

## Personal Access Tokens (PATs)

### Create a PAT

> Code: [backend/src/routes/api-tokens.ts](../../backend/src/routes/api-tokens.ts) (POST - generates raw token shown once; stores SHA-256 hash; accepts optional `productId` for scoping) · [frontend/src/pages/settings/SettingsApps.tsx](../../frontend/src/pages/settings/SettingsApps.tsx) (PAT creation UI)

```bash
# Create unscoped PAT (via cookie session)
curl -s -b cookies.txt -X POST $BASE/api/auth/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"My CI token","expiresAt":"2027-01-01T00:00:00Z"}' | jq .
```

- [ ] Returns 201 with `{ id, name, token, createdAt, expiresAt, productId }`
- [ ] `token` value starts with `planly_` (or confirm prefix)
- [ ] `token` value is only shown in this response - NOT returned in subsequent GETs
- [ ] Cannot create a PAT with an empty name → 400

### Create a product-scoped PAT

```bash
curl -s -b cookies.txt -X POST $BASE/api/auth/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Scoped token\",\"productId\":\"$PRODUCT_ID\"}" | jq .
```

- [ ] Returns `productId` matching the requested product
- [ ] Cannot scope to a product you are not a member of → 403

### List PATs

> Code: [backend/src/routes/api-tokens.ts](../../backend/src/routes/api-tokens.ts) (GET - returns metadata only; raw token field omitted from select)

```bash
curl -s -b cookies.txt $BASE/api/auth/tokens | jq '.[] | {id, name, expiresAt, productId}'
```

- [ ] Returns list of tokens with metadata (no raw token value)
- [ ] Only your own tokens returned (not other users')

### Use a PAT (Bearer auth)

> Code: [backend/src/middleware/auth.ts](../../backend/src/middleware/auth.ts) (Bearer token path: hashes incoming token, looks up hash in DB, checks expiry, checks scope if `productId` present)

Set `TOKEN=planly_...` to the raw token from creation.

```bash
# Access protected resource with PAT
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/auth/me | jq .

# No CSRF header needed
curl -s -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -d '{"name":"Created by PAT"}' | jq .
```

- [ ] PAT authenticates as the creating user
- [ ] No `X-CSRF-Token` header needed with Bearer auth
- [ ] Scoped PAT can access scoped product → 200
- [ ] Scoped PAT rejected for another product → 403 with "Token is not authorized for this project"
- [ ] Scoped PAT rejected for admin endpoints → 403 "Scoped tokens cannot access admin endpoints"
- [ ] Unscoped PAT can access any product the user is a member of
- [ ] Unscoped PAT on admin endpoints: allowed only if user is admin
- [ ] PAT with wrong format (too short, bad prefix) → 401
- [ ] Revoked PAT (after delete) → 401

### Expired PAT

```bash
# Create PAT that expires in 1 second (for testing only)
curl -s -b cookies.txt -X POST $BASE/api/auth/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Expiring token\",\"expiresAt\":\"$(date -u -d '+1 second' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v+1S '+%Y-%m-%dT%H:%M:%SZ')\"}" | jq .
```

- [ ] Wait 2 seconds, then use the token → 401 "Token has expired"

### Revoke a PAT

> Code: [backend/src/routes/api-tokens.ts](../../backend/src/routes/api-tokens.ts) (DELETE - removes DB row; subsequent lookup returns 401)

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/auth/tokens/<token-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Returns 200
- [ ] Using the token after revocation → 401

---

## App Registrations

### Create an app registration

> Code: [backend/src/routes/app-registrations.ts](../../backend/src/routes/app-registrations.ts) (create registration - optional `productId` scope; owner stored for access control)

```bash
# Unscoped registration
curl -s -b cookies.txt -X POST $BASE/api/apps \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"CI Pipeline","description":"Automated test runner"}' | jq .

# Product-scoped registration
curl -s -b cookies.txt -X POST $BASE/api/apps \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Scoped App\",\"productId\":\"$PRODUCT_ID\"}" | jq .
```

- [ ] Returns 201 with `{ id, name, productId, ownerId }`
- [ ] `productId` null for unscoped, set for scoped
- [ ] Cannot scope to a product you are not a member of → 403

### List app registrations

```bash
curl -s -b cookies.txt $BASE/api/apps | jq '.[].name'
```

- [ ] Returns only registrations owned by the current user
- [ ] Unauthenticated → 401

### Update an app registration

```bash
curl -s -b cookies.txt -X PATCH $BASE/api/apps/<app-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Renamed App","description":"Updated description"}' | jq .
```

- [ ] Name and description update
- [ ] Non-owner cannot update → 403 or 404

### Issue a token for an app registration

> Code: [backend/src/routes/app-registrations.ts](../../backend/src/routes/app-registrations.ts) (issue token - raw shown once, SHA-256 hash stored; non-owner rejected)

```bash
curl -s -b cookies.txt -X POST $BASE/api/apps/<app-id>/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"v1"}' | jq .
```

- [ ] Returns raw token - only shown once
- [ ] Multiple tokens can be issued for one registration (rotation support)
- [ ] Non-owner cannot issue tokens → 403

### List tokens for a registration

```bash
curl -s -b cookies.txt $BASE/api/apps/<app-id>/tokens | jq '.[].name'
```

- [ ] Returns token metadata (no raw values)

### Use an app registration token

> Code: [backend/src/middleware/auth.ts](../../backend/src/middleware/auth.ts) (same Bearer lookup path as PATs; app tokens act on behalf of the owner user)

```bash
APP_TOKEN=planly_...   # from issue step above
curl -s -H "Authorization: Bearer $APP_TOKEN" $BASE/api/auth/me | jq .
```

- [ ] Authenticates successfully
- [ ] `me` response shows the owner user (app tokens act on behalf of the owner)
- [ ] Unscoped app token: can access any product the owner is a member of
- [ ] Scoped app token: can only access the scoped product
- [ ] Scoped app token on admin endpoints → 403
- [ ] Scoped app token on other products → 403

### Revoke a token

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/apps/<app-id>/tokens/<token-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Token revoked immediately
- [ ] Using revoked token → 401

### Delete an app registration

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/apps/<app-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Registration and all its tokens deleted
- [ ] All tokens for that registration immediately invalidated
- [ ] Non-owner cannot delete → 403

---

## Token security properties

> Code: [backend/src/routes/api-tokens.ts](../../backend/src/routes/api-tokens.ts) · [backend/src/routes/app-registrations.ts](../../backend/src/routes/app-registrations.ts) - raw token hashed with SHA-256 before insert; select never returns the hash field

- [ ] Raw token value never returned in any GET response after creation
- [ ] Tokens stored as SHA-256 hashes - verify no raw values in database (requires DB access)
- [ ] Token revocation is immediate (no grace period)
- [ ] Expired PAT is rejected even if not explicitly revoked

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
