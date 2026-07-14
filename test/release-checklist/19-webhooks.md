# 19 - Webhooks

← [Back to index](README.md)

You need a webhook receiver to test deliveries. Options:
- Use `https://webhook.site` or `https://requestbin.com` (paste the URL into the webhook form)
- Run `npx @hapi/shot` or a simple local listener: `python3 -m http.server 8080`
- Set `WEBHOOK_URL` env var to your receiver's URL

---

## Webhook CRUD

> Code: [backend/src/routes/webhooks.ts](../../backend/src/routes/webhooks.ts) (CRUD + rotate-secret; secret generated and stored AES-256-GCM encrypted; shown raw once on create and rotate; co-owner only for create/update/delete) · [frontend/src/pages/settings/SettingsWebhooks.tsx](../../frontend/src/pages/settings/SettingsWebhooks.tsx)

```bash
WEBHOOK_URL=https://webhook.site/your-unique-id

# Create webhook
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/webhooks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"url\":\"$WEBHOOK_URL\",\"events\":[\"task.created\",\"task.updated\"],\"active\":true}" | jq .
```

- [ ] Returns 201 with `{ id, url, events, active, secret }` - secret shown once only
- [ ] `secret` value is a hex string (from AES-256-GCM encrypted storage)
- [ ] Cannot create webhook with invalid URL (not `https://`) → 400
- [ ] Cannot create webhook with empty events list → 400

```bash
# List webhooks
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/webhooks | jq '.[].url'

# Get single webhook (no secret returned)
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/webhooks/<wh-id> | jq .
```

- [ ] List returns all webhooks for the product
- [ ] Secret is NOT returned in list or GET responses (only at creation)

```bash
# Update webhook (add event, deactivate)
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/webhooks/<wh-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"events":["task.created","task.updated","member.added"],"active":false}' | jq .
```

- [ ] Events list updated
- [ ] `active: false` → subsequent events do NOT trigger deliveries

```bash
# Rotate secret
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/webhooks/<wh-id>/rotate-secret \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Returns new secret (old one invalidated)
- [ ] Subsequent deliveries signed with new secret

```bash
# Delete webhook
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/webhooks/<wh-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Webhook removed; no further deliveries

---

## Event delivery

> Code: [backend/src/routes/webhooks.ts](../../backend/src/routes/webhooks.ts) (delivery function: POSTs payload to URL with `X-Planly-Event` and `X-Planly-Signature: sha256=<hmac>` headers; logs delivery result)

Trigger each event and verify delivery at your receiver:

### task.created

```bash
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Webhook trigger task"}' | jq .
```

- [ ] Receiver gets a POST within a few seconds
- [ ] Payload has `event: "task.created"`, `timestamp`, `payload.id`, `payload.name`
- [ ] `X-Planly-Event: task.created` header present
- [ ] `X-Planly-Signature: sha256=<hex>` header present

### task.updated

```bash
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/tasks/<task-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"status":"done"}' | jq .
```

- [ ] Receiver gets `event: "task.updated"` with updated fields

### task.deleted

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/tasks/<task-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Receiver gets `event: "task.deleted"`

### member.added

- [ ] Invite Charlie to Alpha Project → `member.added` event fires

### member.removed

- [ ] Remove Charlie from Alpha Project → `member.removed` event fires

### sprint.started / sprint.ended

- [ ] Mark sprint as active → `sprint.started` event (if implemented)
- [ ] End sprint → `sprint.ended` event (if implemented)

---

## Signature verification

> Code: [backend/src/routes/webhooks.ts](../../backend/src/routes/webhooks.ts) (HMAC-SHA256 with the decrypted secret; `crypto.createHmac('sha256', secret).update(body).digest('hex')`)

Copy the `secret` from webhook creation. Verify signatures from received payloads:

```bash
# Node.js verification snippet (run in node REPL):
# const crypto = require('crypto');
# const secret = '<your-webhook-secret>';
# const body = '<raw-request-body-from-receiver>';
# const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
# const received = '<X-Planly-Signature-header>';
# console.log(expected === received ? 'VALID' : 'INVALID');
```

- [ ] Signature matches for a legitimate delivery
- [ ] Manually altering the payload body → signature mismatch (verification fails)
- [ ] Using the wrong secret → signature mismatch

---

## Delivery log (`GET /webhooks/:webhookId/deliveries`)

> Code: [backend/src/routes/webhooks.ts](../../backend/src/routes/webhooks.ts) (deliveries sub-route - returns attempt history with timestamp, event type, HTTP status from receiver)

```bash
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/webhooks/<wh-id>/deliveries | jq .
```

- [ ] All delivery attempts listed with: timestamp, event type, HTTP status from receiver, success/fail
- [ ] Failed deliveries (receiver returned 4xx/5xx) shown with status code
- [ ] Delivery history persists across page reload

---

## Inactive webhook

- [ ] Set `active: false` → trigger a task.created → NO delivery occurs
- [ ] Delivery log shows no new entry for the deactivated period

---

## Access control

- [ ] Regular member (Alice) cannot create webhooks → 403
- [ ] Non-member (Charlie) cannot list webhooks → 403
- [ ] Non-member cannot access deliveries → 403

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
