# 06 — Teams, Products & Membership

← [Back to index](README.md)

---

## Teams (`/api/teams`)

```bash
# Create a team
curl -s -b cookies.txt -X POST $BASE/api/teams \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Test Team","emoji":"🚀"}' | jq .

# List your teams
curl -s -b cookies.txt $BASE/api/teams | jq '.[].name'

# Get a team
curl -s -b cookies.txt $BASE/api/teams/<team-id> | jq .

# Update a team
curl -s -b cookies.txt -X PATCH $BASE/api/teams/<team-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Renamed Team"}' | jq .

# Delete a team
curl -s -b cookies.txt -X DELETE $BASE/api/teams/<team-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Create team with name and emoji → appears in sidebar
- [ ] Rename team → updates everywhere
- [ ] Delete team → team and its products removed; members lose access
- [ ] Cannot create a team with an empty name → 400
- [ ] Non-member cannot GET a team they don't belong to → 403 or empty list

### Team members

```bash
# Add member
curl -s -b cookies.txt -X POST $BASE/api/teams/<team-id>/members \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"userId":"<alice-id>","role":"member"}' | jq .

# List members
curl -s -b cookies.txt $BASE/api/teams/<team-id>/members | jq '.[].username'

# Change role
curl -s -b cookies.txt -X PATCH "$BASE/api/teams/<team-id>/members/<alice-id>/role" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"role":"co_owner"}' | jq .

# Remove member
curl -s -b cookies.txt -X DELETE "$BASE/api/teams/<team-id>/members/<alice-id>" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Add Alice as member → she can see team's products
- [ ] Promote Alice to co_owner → she can manage settings
- [ ] Demote Alice back to member → loses co-owner privileges
- [ ] Remove Alice → she loses access to all team products
- [ ] Cannot remove the last co_owner → clear error

---

## Invites

### Open invite link

```bash
# Create open invite
curl -s -b cookies.txt -X POST $BASE/api/teams/<team-id>/invites \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"maxUses":5,"role":"member"}' | jq .

# List invites
curl -s -b cookies.txt $BASE/api/teams/<team-id>/invites | jq .

# Delete invite
curl -s -b cookies.txt -X DELETE "$BASE/api/teams/<team-id>/invites/<invite-id>" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Create open invite → get token
- [ ] Visit `/invites/<token>` as Charlie (outsider) → invited to join
- [ ] Accept invite → Charlie is now a member
- [ ] Visit the same invite link again → still works (multi-use) if maxUses not reached
- [ ] After maxUses reached → link rejected with clear error
- [ ] Invite expires after 7 days → clear error
- [ ] Delete invite → link no longer works

### Email invite

```bash
curl -s -b cookies.txt -X POST $BASE/api/teams/<team-id>/invites \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"charlie@test.local","role":"member"}' | jq .
```

- [ ] Email invite sent to `charlie@test.local` (or logged to console)
- [ ] Email invite link works only for that exact email
- [ ] Email invite is single-use — second click rejected
- [ ] Another user (different email) cannot use the email invite link

### Invite landing page

```bash
# Get invite info (before accepting)
curl -s $BASE/api/invites/<token> | jq .
```

- [ ] `GET /api/invites/<token>` returns team name and invite details (no auth required)
- [ ] `POST /api/invites/<token>/accept` without auth → 401 (must log in first)
- [ ] Accept invite while logged in as Alice → Alice added to team

---

## Products (Projects)

```bash
# Create product
curl -s -b cookies.txt -X POST $BASE/api/products \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"My Product","teamId":"<team-id>","emoji":"📊"}' | jq .

# List products (member's products)
curl -s -b cookies.txt $BASE/api/products | jq '.[].name'

# Get single product
curl -s -b cookies.txt $BASE/api/products/<product-id> | jq .

# Update product
curl -s -b cookies.txt -X PATCH $BASE/api/products/<product-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Renamed Product","deadline":"2027-12-31"}' | jq .

# Delete product
curl -s -b cookies.txt -X DELETE $BASE/api/products/<product-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Create product → appears in project picker dropdown
- [ ] Create second product → both appear, switching works
- [ ] Edit product name → updates in project picker
- [ ] Edit emoji → updates in project picker
- [ ] Edit deadline → shows in settings
- [ ] Delete product → removed, redirected away
- [ ] Charlie (non-member) cannot GET the product → 403
- [ ] `allowProjectCreation: false` → regular user's POST to /api/products returns 403

### Product discovery

```bash
curl -s -b cookies.txt $BASE/api/products/discover | jq '.[].name'
```

- [ ] Returns list of products the user can request access to (not already a member)

---

## Access Requests

```bash
# Non-member requests access
curl -s -b cookies-charlie.txt -X POST $BASE/api/products/<product-id>/access-requests \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CHARLIE_CSRF" \
  -d '{"message":"Please let me in"}' | jq .

# Owner lists requests
curl -s -b cookies.txt $BASE/api/products/<product-id>/access-requests | jq .

# Approve
curl -s -b cookies.txt -X PATCH "$BASE/api/products/<product-id>/access-requests/<req-id>" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"status":"approved"}' | jq .

# Deny
curl -s -b cookies.txt -X PATCH "$BASE/api/products/<product-id>/access-requests/<req-id>" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"status":"denied"}' | jq .
```

- [ ] Charlie requests access to Alpha Project
- [ ] Admin receives notification
- [ ] Admin approves → Charlie gets member access
- [ ] Charlie requests again → denied → Charlie sees rejection message
- [ ] Cannot request access to a product you are already a member of
- [ ] Cannot approve an already-denied request

---

## Memberships modal

- [ ] Open Memberships modal (profile menu → "My Memberships" or similar)
- [ ] All products listed with correct role badge (co_owner / member / viewer)
- [ ] "Leave" button shown for non-owners
- [ ] Clicking "Leave" as member → confirm → user removed → product disappears from picker
- [ ] Clicking "Leave" as owner → dialog offers Transfer or Delete
- [ ] Transfer ownership → select another co_owner → confirm → new owner shown
- [ ] Delete project from ownership dialog → product removed everywhere

---

## Permissions tab (`GET/PUT /api/products/:productId/permissions`)

See [22-access-control.md](22-access-control.md) for the full matrix.

```bash
# Get permissions for Alice on Alpha Project
curl -s -b cookies.txt $BASE/api/products/<product-id>/permissions | jq .

# Update Alice's tab permissions
curl -s -b cookies.txt -X PUT $BASE/api/products/<product-id>/permissions \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"userId":"<alice-id>","tabs":{"kanban":"read","analytics":"none"}}' | jq .
```

- [ ] Default permissions for new members match SECURITY.md table
- [ ] Setting kanban to `none` hides the Kanban tab for that user
- [ ] Setting analytics to `read` allows viewing but not editing
- [ ] Co-owner always has write access regardless of permission overrides
- [ ] Admin always has full access

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
