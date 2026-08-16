# Webhooks

Planly can push events to any HTTP endpoint when things happen in your projects. Payloads are signed with HMAC-SHA256 so receivers can verify the request is genuinely from Planly.

---

## Contents

- [Creating a Webhook](#creating-a-webhook)
- [Event Catalog](#event-catalog)
- [Payload Format](#payload-format)
- [Verifying Signatures](#verifying-signatures)
- [Delivery Behavior](#delivery-behavior)
- [Rotating the Secret](#rotating-the-secret)
- [Disabling and Re-enabling](#disabling-and-re-enabling)

---

## Creating a Webhook

Via the UI: Project → **Settings** → **Webhooks** → **New Webhook**.

Via the API:

```http
POST /api/products/:productId/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://hooks.example.com/planly",
  "events": ["task.created", "task.updated"],
  "active": true
}
```

The response includes a `secret` field. **Copy it now** - it's only shown at creation. You'll need it to verify signatures.

---

## Event Catalog

| Event | When it fires |
|---|---|
| `task.created` | A new task is created in the project |
| `task.updated` | A task's fields are changed (name, description, color, deadline, etc.) — anything other than status or owner |
| `task.status_changed` | A task's status (column) is changed via a PATCH |
| `task.assigned` | A task's owner (`ownerId`) is changed via a PATCH |
| `task.deleted` | A task is soft-deleted |
| `subplan.created` | A sub-plan is created |
| `subplan.updated` | A sub-plan is updated or ended |
| `subplan.deleted` | A sub-plan is deleted |
| `message.created` | A message is posted in the project chat |

> Event names follow the `resource.action` pattern. Subscribe only to the events you need - unnecessary subscriptions increase latency and noise.

---

## Payload Format

Every webhook delivery is an HTTP `POST` with:

```
Content-Type: application/json
X-Planly-Signature: sha256=<hmac-hex>
X-Planly-Event: task.created
```

Body:

```json
{
  "event": "task.created",
  "timestamp": "2026-07-07T14:23:00.000Z",
  "payload": {
    // Event-specific data - see examples below
  }
}
```

### task.created / task.updated / task.status_changed / task.assigned

All four events share the exact same `payload` shape - the full task row plus its `owner`, `reviewer`, `creator`, `subtasks`, and dependency relations (only the top-level `event` name differs):

```json
{
  "event": "task.created",
  "timestamp": "2026-07-07T14:23:00.000Z",
  "payload": {
    "id": "task-uuid",
    "productId": "product-uuid",
    "name": "Fix login bug",
    "description": null,
    "status": "todo",
    "ownerId": "user-uuid-1",
    "reviewerId": null,
    "color": null,
    "deadline": null,
    "canvasX": null,
    "canvasY": null,
    "kanbanOrder": 0,
    "milestoneOrder": 0,
    "completedBy": null,
    "completedAt": null,
    "createdBy": "user-uuid-2",
    "githubUrl": null,
    "createdAt": "2026-07-07T14:23:00.000Z",
    "updatedAt": "2026-07-07T14:23:00.000Z",
    "deletedAt": null,
    "owner": { "id": "user-uuid-1", "username": "alice", "realName": "Alice Smith", "avatarEmoji": "🦊" },
    "reviewer": null,
    "creator": { "id": "user-uuid-2", "username": "bob", "realName": "Bob Jones" },
    "subtasks": [],
    "dependsOn": [],
    "requiredBy": []
  }
}
```

Notes:
- `status` is whichever Kanban column the task is in - the built-in columns use the slugs `todo`, `in_progress`, `blocked`, `done`, but custom columns get a generated slug (e.g. `col_a1b2c3d4e5f6`); don't assume the four defaults are the only possible values.
- There is no `priority` field, no `assigneeId`/`assigneeUsername` (the relation is `ownerId` + a nested `owner` object), no scalar `sprintId` (sprint membership is a many-to-many join, not shown here), and no `dueDate` - the deadline field is called `deadline`.
- `owner`, `reviewer`, and `creator` are `null` when unset, otherwise `{ id, username, realName, avatarEmoji }` (`creator` omits `avatarEmoji`).
- `dependsOn` / `requiredBy` are arrays of `{ prerequisiteId }` / `{ dependentId }` - the task's dependency graph edges.
- `task.deleted` is the one exception: its payload is just `{ "id": "...", "name": "..." }`, not the full task shape above.

---

## Verifying Signatures

The `X-Planly-Signature` header is `sha256=` followed by the HMAC-SHA256 hex digest of the raw request body, using the webhook's secret as the key.

**Always verify signatures.** This ensures the request came from Planly and wasn't tampered with in transit.

### Node.js / TypeScript

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyPlanlySignature(
  body: string,         // raw request body as a string
  secret: string,       // your webhook secret
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const actual = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

// Express example
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const valid = verifyPlanlySignature(
    req.body.toString(),
    process.env.PLANLY_WEBHOOK_SECRET,
    req.headers['x-planly-signature']
  );
  if (!valid) return res.status(401).send('Invalid signature');
  const event = JSON.parse(req.body.toString());
  // handle event...
  res.send('ok');
});
```

> **Use `timingSafeEqual`** to compare signatures. A naive string comparison is vulnerable to timing attacks.

### Python

```python
import hmac, hashlib

def verify_signature(body: bytes, secret: str, header: str) -> bool:
    if not header.startswith('sha256='):
        return False
    expected = 'sha256=' + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header)
```

### Go

```go
import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "strings"
)

func verifySignature(body []byte, secret, header string) bool {
    if !strings.HasPrefix(header, "sha256=") { return false }
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(header))
}
```

---

## Delivery Behavior

- Planly sends deliveries with a **8-second timeout**.
- Your endpoint must respond with any `2xx` status within that window.
- `4xx` and `5xx` responses are logged as failed deliveries.
- **No automatic retry** - check your delivery log if you miss events.

### Viewing delivery history

UI: Project → **Settings** → **Webhooks** → click a webhook → **Deliveries**.

API:
```http
GET /api/products/:productId/webhooks/:webhookId/deliveries
```

Each delivery record shows: event name, HTTP status code, whether it succeeded, and the first 1000 characters of the response body.

---

## Rotating the Secret

If your secret is compromised, rotate it immediately:

UI: Project → **Settings** → **Webhooks** → **Rotate Secret**.

API:
```http
POST /api/products/:productId/webhooks/:webhookId/rotate-secret
```

The new secret is returned in the response. Update your receiver immediately - the old secret is invalidated.

---

## Disabling and Re-enabling

Set `active: false` to pause deliveries without deleting the webhook. Events that occur while a webhook is inactive are **not queued** - they are silently dropped.

```http
PATCH /api/products/:productId/webhooks/:webhookId
{ "active": false }
```
