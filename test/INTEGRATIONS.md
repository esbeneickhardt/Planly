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

# Confirm session works
curl -s $BASE/api/auth/me -H "Cookie: token=$TOKEN" | jq .username
```

---

## Personal Access Tokens (PATs)

UI path: Settings → API Tokens → Generate new token

```bash
# Create a PAT
curl -s -X POST $BASE/api/auth/tokens \
  -H "Cookie: token=$TOKEN" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test PAT"}' | jq .

PAT=<paste rawToken — shown ONCE, copy it now>
```

```bash
# Use the PAT — no cookies needed, just the Authorization header
curl -s $BASE/api/auth/me -H "Authorization: Bearer $PAT" | jq .username
```

- [ ] Response returns the correct username
- [ ] PAT appears in Settings → API Tokens
- [ ] Revoke the PAT in the UI → same `Bearer` call returns 401

---

## App Registrations

UI path: Settings → App Registrations → Register new app

```bash
# Create an app
curl -s -X POST $BASE/api/apps \
  -H "Cookie: token=$TOKEN" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"My CI Bot"}' | jq .

APP_ID=<paste id>

# Issue a token for the app
curl -s -X POST $BASE/api/apps/$APP_ID/tokens \
  -H "Cookie: token=$TOKEN" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"v1"}' | jq .

APP_TOKEN=<paste rawToken — shown ONCE>
```

```bash
# Use the app token
curl -s $BASE/api/auth/me -H "Authorization: Bearer $APP_TOKEN" | jq .
```

- [ ] App token authenticates successfully
- [ ] App appears in Settings → App Registrations
- [ ] Rotate the token in the UI → old `APP_TOKEN` returns 401, new token works

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
  -H "Cookie: token=$TOKEN" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$WEBHOOK_URL\",\"events\":[\"task.created\",\"task.updated\",\"task.deleted\"]}" | jq .

WEBHOOK_ID=<paste id>
WEBHOOK_SECRET=<paste secret — shown ONCE>
```

**Step 3 — trigger a delivery**

```bash
TASK_ID=$(curl -s -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Cookie: token=$TOKEN" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"name":"Webhook test","status":"backlog"}' | jq -r .id)

echo "Task created: $TASK_ID"
```

- [ ] webhook.site receives a POST within a few seconds
- [ ] Payload has `event: "task.created"` and the task object
- [ ] `X-Planly-Signature` header is present

**Step 4 — verify the signature**

```bash
# Re-use the raw body from webhook.site's "Raw content" tab
echo -n '<paste raw body>' | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex
```

- [ ] Computed digest matches the `X-Planly-Signature` header value

**Step 5 — check the delivery log**

```bash
curl -s $BASE/api/products/$PRODUCT_ID/webhooks/$WEBHOOK_ID/deliveries \
  | jq '.[0] | {event, responseCode, duration}'
```

- [ ] Delivery shows status 200 and the correct event name
- [ ] Update the task → `task.updated` delivery appears in the log
- [ ] Delete the task → `task.deleted` fires

**Step 6 — clean up**

```bash
curl -s -X DELETE $BASE/api/products/$PRODUCT_ID/webhooks/$WEBHOOK_ID \
  -H "Cookie: token=$TOKEN" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Webhook deleted → no further deliveries when creating tasks

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
