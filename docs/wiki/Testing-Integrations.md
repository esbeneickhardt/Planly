# Integrations Test

~15 minutes. Tests Personal Access Tokens, App Registrations, and Webhooks end-to-end.

**Prerequisites:** Stack running, Admin logged in, "Alpha" project exists from [SMOKE.md](SMOKE.md).

---

## Setup: session variables

Open browser DevTools → Application → Cookies → `http://localhost`. Copy the `token` and `csrf` values:

```bash
BASE=http://localhost
TOKEN=<paste token cookie>
CSRF=<paste csrf cookie>
PRODUCT_ID=<paste Alpha project ID from URL>

# Confirm session works (GET — no CSRF header needed; CSRF is only enforced on POST/PUT/PATCH/DELETE)
curl -s $BASE/api/auth/me -H "Cookie: token=$TOKEN" | jq .username
```

---

## Personal Access Tokens (PATs)

UI path: Settings → API Tokens → Generate new token

```bash
# Create a PAT
curl -s -X POST $BASE/api/auth/tokens \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test PAT"}' | jq .

PAT=<paste rawToken — shown ONCE, copy it now>
```

```bash
# Use the PAT — no cookies needed, just the Authorization header
curl -s $BASE/api/auth/me -H "Authorization: Bearer $PAT" | jq .username
```

- [X] Response returns the correct username
- [X] PAT appears in Settings → API Tokens
- [X] Revoke the PAT in the UI → same `Bearer` call returns 401

---

## App Registrations

UI path: Settings → App Registrations → Register new app

```bash
# Create an app
curl -s -X POST $BASE/api/apps \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"My CI Bot"}' | jq .

APP_ID=<paste id>

# Issue a token for the app
curl -s -X POST $BASE/api/apps/$APP_ID/tokens \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"v1"}' | jq .

APP_TOKEN=<paste rawToken — shown ONCE>
```

```bash
# Use the app token — identity should be the app name, not the creator's username
curl -s $BASE/api/auth/me -H "Authorization: Bearer $APP_TOKEN" | jq .
```

- [X] App token authenticates successfully
- [X] Response shows `{ username: "My CI Bot", isApp: true, createdBy: "<your username>" }`
- [X] App appears in Settings → App Registrations
- [X] Rotate the token in the UI → old `APP_TOKEN` returns 401, new token works

**Permission enforcement**

```bash
# Set kanban to read-only and block messages entirely
curl -s -X PATCH $BASE/api/apps/$APP_ID/permissions \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"kanban":"read","messages":"none"}' | jq .permissions
```

```bash
# Read tasks — allowed (kanban is read)
curl -s "$BASE/api/products/$PRODUCT_ID/tasks" \
  -H "Authorization: Bearer $APP_TOKEN" | jq 'length'

# Create a task — forbidden (kanban is read, not write)
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$BASE/api/products/$PRODUCT_ID/tasks" \
  -H "Authorization: Bearer $APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"should fail","status":"backlog"}'
# Expected: 403

# Post a message — forbidden (messages is none)
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$BASE/api/products/$PRODUCT_ID/messages" \
  -H "Authorization: Bearer $APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"should fail"}'
# Expected: 403
```

- [ ] GET tasks returns an array (200)
- [ ] POST task returns 403
- [ ] POST message returns 403

**Creator independence**

```bash
# Reset to full write
curl -s -X PATCH $BASE/api/apps/$APP_ID/permissions \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"kanban":"write","messages":"write"}' | jq .permissions

# Confirm the app can create tasks
TASK_ID=$(curl -s -X POST "$BASE/api/products/$PRODUCT_ID/tasks" \
  -H "Authorization: Bearer $APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"App bot task","status":"backlog"}' | jq -r .id)
echo "Created: $TASK_ID"
```

Now remove the creator from the project (Settings → Team → remove yourself, or use a second admin account), then retry:

```bash
curl -s "$BASE/api/products/$PRODUCT_ID/tasks" \
  -H "Authorization: Bearer $APP_TOKEN" | jq 'length'
```

- [ ] App token still returns tasks after creator is removed from the project

---

## Webhooks

**Step 1 — get a receiver URL**

Go to [webhook.site](https://webhook.site) and copy your unique URL:

```bash
WEBHOOK_URL=https://webhook.site/<your-unique-id>
```

**Step 2 — register the webhook on Alpha**

```bash
curl -s -X POST $BASE/api/products/$PRODUCT_ID/webhooks \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$WEBHOOK_URL\",\"events\":[\"task.created\",\"task.updated\",\"task.deleted\"]}" | jq .

WEBHOOK_ID=<paste id>
WEBHOOK_SECRET=<paste secret — shown ONCE>
```

**Step 3 — trigger a delivery**

```bash
TASK_ID=$(curl -s -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"Webhook test","status":"backlog"}' | jq -r .id)

echo "Task created: $TASK_ID"
```

- [X] webhook.site receives a POST within a few seconds
- [X] Payload has `event: "task.created"` and the task object
- [X] `X-Planly-Signature` header is present

**Step 4 — verify the signature**

On webhook.site, click the delivery you just received:
- **Headers** tab → copy the value of `X-Planly-Signature` — it looks like `sha256=abc123…`
- **Body** tab → copy the entire raw JSON body — it looks like `{"event":"task.created","payload":{…},"timestamp":"2026-…Z"}`

```bash
# Paste the raw JSON body exactly as-is (one line, no extra whitespace)
RAW_BODY='{"event":"task.created","payload":{…},"timestamp":"2026-…Z"}'

echo -n "$RAW_BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET"
# Output: SHA256(stdin)= abc123…
# Compare the hex after "SHA256(stdin)= " against the hex after "sha256=" in the header
```

- [X] The two hex strings match

**Step 5 — check the delivery log**

```bash
curl -s $BASE/api/products/$PRODUCT_ID/webhooks/$WEBHOOK_ID/deliveries \
  -H "Cookie: token=$TOKEN" \
  | jq '.[0] | {event, responseCode, duration}'
```

- [X] Delivery shows status 200 and the correct event name
- [X] Update the task → `task.updated` delivery appears in the log
- [X] Delete the task → `task.deleted` fires

**Step 6 — clean up**

```bash
curl -s -X DELETE $BASE/api/products/$PRODUCT_ID/webhooks/$WEBHOOK_ID \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [X] Webhook deleted → no further deliveries when creating tasks

---

## Webhook event coverage

The webhook configuration UI lets you subscribe to 9 event types. All 9 are dispatched in code.

| Event | Dispatched? |
|---|---|
| `task.created` | ✅ |
| `task.updated` | ✅ (any field change other than status) |
| `task.status_changed` | ✅ (PATCH with `status` field that differs) |
| `task.deleted` | ✅ |
| `message.created` | ✅ |
| `task.assigned` | ✅ (PATCH that changes `ownerId`) |
| `subplan.created` | ✅ |
| `subplan.updated` | ✅ |
| `subplan.deleted` | ✅ |

Re-use the webhook from the section above (or create a new one subscribed to `task.status_changed,message.created`):

```bash
# Trigger task.status_changed — update the task's status field
curl -s -X PATCH $BASE/api/products/$PRODUCT_ID/tasks/$TASK_ID \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' | jq .status
```

- [X] webhook.site receives a delivery with `event: "task.status_changed"`

```bash
# Trigger message.created — post a message to the Alpha channel
curl -s -X POST $BASE/api/products/$PRODUCT_ID/messages \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"content":"webhook event test"}' | jq .id
```

- [X] webhook.site receives a delivery with `event: "message.created"`

---

## Permission-scoped API calls

Verify that per-tab permissions are enforced for token-authenticated requests, not just browser sessions.

**Prerequisites:** Alice is a member of Alpha. Set her Kanban to **read** via Settings → Permissions → save.

Create a PAT for Alice (log in as Alice in a second browser tab to get her session):

```bash
ALICE_TOKEN=<paste Alice's token cookie>
ALICE_CSRF=<paste Alice's csrf cookie>

ALICE_PAT_RAW=$(curl -s -X POST $BASE/api/auth/tokens \
  -H "Cookie: token=$ALICE_TOKEN; csrf=$ALICE_CSRF" \
  -H "X-CSRF-Token: $ALICE_CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"alice-read-test"}' | jq -r .token)
```

```bash
# Read — allowed (Kanban is read)
curl -s $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Authorization: Bearer $ALICE_PAT_RAW" | jq 'length'

# Write — forbidden (Kanban is read, not write)
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Authorization: Bearer $ALICE_PAT_RAW" \
  -H "Content-Type: application/json" \
  -d '{"name":"should fail","status":"backlog"}'
```

- [X] GET tasks returns an array (200)
- [X] POST tasks returns 403

```bash
# Look up Alice's user ID first
ALICE_ID=$(curl -s $BASE/api/auth/me -H "Authorization: Bearer $ALICE_PAT_RAW" | jq -r .id)

# Reset Alice's Kanban back to write via Admin's session
# The endpoint takes an array of { userId, tab, level } tuples
curl -s -X PUT $BASE/api/products/$PRODUCT_ID/permissions \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d "[{\"userId\":\"$ALICE_ID\",\"tab\":\"kanban\",\"level\":\"write\"}]" | jq .
```

---

## GitHub integration

UI path: Admin → Settings → GitHub (server admin only).

```bash
# Get current config (admin session required)
curl -s $BASE/api/github/config -H "Cookie: token=$TOKEN" | jq .
```

- [X] Returns `{ webhookUrl, hasSecret, githubImportIssues, githubImportPrs, githubDefaultProductId }`

```bash
# Generate (or rotate) the webhook secret
GH_SECRET=$(curl -s -X POST $BASE/api/github/regenerate-secret \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r .secret)

echo "GitHub secret: $GH_SECRET"
```

- [X] `secret` is a 64-character hex string

```bash
# Enable issue import and point at the Alpha project
curl -s -X POST $BASE/api/github/config \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d "{\"githubImportIssues\":true,\"githubDefaultProductId\":\"$PRODUCT_ID\"}" | jq .
```

- [X] Returns `{ ok: true }`

```bash
# Simulate a GitHub webhook — sign the body and POST to the receiver
GH_BODY='{"action":"opened","issue":{"number":42,"title":"Test issue from GitHub","html_url":"https://github.com/test/repo/issues/42","body":"A test issue","user":{"login":"testuser"}}}'

GH_SIG="sha256=$(echo -n "$GH_BODY" | openssl dgst -sha256 -hmac "$GH_SECRET" | awk '{print $2}')"

curl -s -X POST $BASE/api/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -H "X-Hub-Signature-256: $GH_SIG" \
  -d "$GH_BODY" | jq .
```

- [X] Returns `{ ok: true }`
- [X] A new task appears in Alpha's backlog with the issue title

```bash
# Reject a request with a bad signature
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST $BASE/api/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -H "X-Hub-Signature-256: sha256=badhex" \
  -d "$GH_BODY"
# Expected: 401
```

- [X] Returns 401

---

## iCal calendar feed

Each user gets a token-scoped subscription URL for task due dates.

```bash
# The iCal feed authenticates via a PAT — scope it to the product
PAT_SCOPED_RAW=$(curl -s -X POST $BASE/api/auth/tokens \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ical-test\",\"productId\":\"$PRODUCT_ID\"}" | jq -r .token)
```

```bash
# Fetch the calendar feed
curl -s "$BASE/api/products/$PRODUCT_ID/calendar.ics?token=$PAT_SCOPED_RAW"
```

- [X] Response starts with `BEGIN:VCALENDAR`
- [X] `Content-Type: text/calendar` header
- [X] Any tasks with due dates appear as `VEVENT` blocks
- [X] Request without a token returns 401

```bash
# Confirm unauthenticated request is rejected
curl -s -o /dev/null -w "%{http_code}\n" \
  "$BASE/api/products/$PRODUCT_ID/calendar.ics"
# Expected: 401
```

---

## Multi-factor authentication (TOTP)

Requires an authenticator app (e.g. Google Authenticator, Authy).

**Enable TOTP**

```bash
# Step 1 — initiate setup (session cookie auth, not Bearer)
curl -s -X POST $BASE/api/auth/totp/setup \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '{secret, qrDataUrl: (.qrDataUrl | .[0:40])}'
```

- [X] Response includes a `qr` field (data:image/png;base64,… — the QR code) and a `secret` field (Base32)
- [X] Scan the QR code with your authenticator app — "Planly / admin" appears in the app

```bash
# Step 2 — confirm setup with the 6-digit code shown in your app
# (replace 123456 with the live code from your authenticator)
curl -s -X POST $BASE/api/auth/totp/confirm \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"code":"123456"}' | jq .
```

- [X] Returns `{ ok: true, backupCodes: ["…", …] }` — **copy the backup codes now**
- [X] Settings → Security now shows TOTP as enabled

**Test the login flow with TOTP active**

1. Log out in the UI
2. Log in with admin credentials — you should be redirected to an MFA prompt
3. Enter the 6-digit code from your authenticator app
4. You are logged in normally

- [X] Partial login (before TOTP) cannot access protected endpoints
- [X] Full login after TOTP code works

**Test a backup code**

1. Log out
2. Log in → reach the MFA prompt → click "Use a backup code instead"
3. Enter one of the backup codes from setup

- [X] Login succeeds with the backup code
- [X] The same backup code is rejected a second time (single-use)

**Disable TOTP**

```bash
# Requires current password as confirmation; uses DELETE not POST
curl -s -X DELETE $BASE/api/auth/totp/disable \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"password":"<admin-password>"}' | jq .
```

- [X] Returns `{ ok: true }`
- [X] Next login succeeds without a TOTP prompt

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
