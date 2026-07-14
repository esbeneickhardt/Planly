# 20 - Integrations (iCal, Export, GitHub)

← [Back to index](README.md)

---

## iCal export (`/api/products/:productId/calendar.ics`)

### Generate a calendar token

> Code: [backend/src/routes/ical.ts](../../backend/src/routes/ical.ts) (calendar token create/revoke - token embedded in URL, no session cookie needed for the `.ics` feed)

```bash
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/calendar/token \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Returns a calendar token (opaque string)
- [ ] Token can be regenerated (old one invalidated)

### Subscribe to calendar

> Code: [backend/src/routes/ical.ts](../../backend/src/routes/ical.ts) (`calendar.ics` handler - generates VCALENDAR from tasks with deadlines; validates token; `Content-Type: text/calendar`)

```bash
# The .ics URL (no auth required - token is embedded in the URL or passed as query param)
curl -s "$BASE/api/products/$PRODUCT_ID/calendar.ics?token=<cal-token>" -o /tmp/planly.ics
head -20 /tmp/planly.ics
```

- [ ] Response has `Content-Type: text/calendar` header
- [ ] Response starts with `BEGIN:VCALENDAR`
- [ ] Tasks with deadlines appear as `VEVENT` entries
- [ ] Event summary matches task name
- [ ] Event `DTEND` matches task deadline
- [ ] Tasks without deadlines do NOT appear
- [ ] Token required - URL without token → 401 or 403

### Delete calendar token

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/calendar/token \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Old token immediately invalidated
- [ ] iCal URL with old token returns 401

---

## Data export (`GET /api/products/:productId/export`)

> Code: [backend/src/routes/export.ts](../../backend/src/routes/export.ts) (returns full product JSON: tasks with subtasks/dependencies, columns, sprints, members; excludes sensitive fields)

```bash
curl -s -b cookies.txt "$BASE/api/products/$PRODUCT_ID/export" -o /tmp/planly-export.json
wc -c /tmp/planly-export.json
cat /tmp/planly-export.json | jq 'keys'
```

- [ ] Returns JSON (or ZIP with multiple files - check actual format)
- [ ] Contains tasks, columns, sprints, team members
- [ ] Task subtasks and dependencies included
- [ ] No sensitive data (passwords, token hashes) in the export
- [ ] Non-member (Charlie) → 403

### Personal data export (`GET /api/me/export`)

> Code: [backend/src/routes/me-export.ts](../../backend/src/routes/me-export.ts) (GDPR Art. 20 portability export - complete, no pagination cap)

```bash
curl -s -b alice-cookies.txt $BASE/api/me/export | jq 'keys'
# Expected keys: exportedAt, profile, tasks, messages, notifications, apiTokens,
#                announcements, announcementComments, accessRequests, teamMemberships
```

- [ ] Returns JSON with all expected top-level keys
- [ ] `profile` contains Alice's email, username, and decrypted realName/phone (not hashed password or token secrets)
- [ ] `tasks` contains only tasks Alice created, owns, or is reviewer on - not all project tasks
- [ ] `messages` contains all messages Alice authored (no arbitrary cap)
- [ ] `teamMemberships` lists every team Alice belongs to
- [ ] No other users' private data included (no other users' messages, profiles, or tokens)

---

## GitHub integration (`/api/github/`)

> Code: [backend/src/routes/github.ts](../../backend/src/routes/github.ts) (config CRUD - secret stored AES-256-GCM encrypted, not returned in GET; webhook handler validates GitHub HMAC signature) · [frontend/src/components/common/IntegrationsModal.tsx](../../frontend/src/components/common/IntegrationsModal.tsx) (GitHub config UI)

```bash
# Get current GitHub config
curl -s -b cookies.txt $BASE/api/github/config | jq .

# Set GitHub config
curl -s -b cookies.txt -X POST $BASE/api/github/config \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"repoOwner":"EsbenEickhardt","repoName":"planly","webhookSecret":"gh-secret"}' | jq .

# Regenerate GitHub webhook secret
curl -s -b cookies.txt -X POST $BASE/api/github/regenerate-secret \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] GitHub config can be saved (owner, repo, secret)
- [ ] Secret stored encrypted (not returned in GET response)
- [ ] Regenerating secret returns a new value
- [ ] `POST /api/github/webhook` receives GitHub push events (requires GitHub side configuration)
- [ ] Non-admin cannot manage GitHub config → 403

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
