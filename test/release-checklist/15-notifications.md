# 15 — Notifications

← [Back to index](README.md)

---

## Notification triggers

Perform each action as Admin; verify Alice's bell updates in real time:

- [ ] Assign a task to Alice → Alice gets a notification
- [ ] Mention Alice in a message (`@alice`) → Alice gets a notification
- [ ] Post a comment on a task assigned to Alice → Alice gets a notification
- [ ] Access request submitted → product owner gets a notification

---

## Notification bell (UI)

- [ ] Bell icon visible in top bar for all logged-in users
- [ ] Unread badge appears with count when Alice has unread notifications
- [ ] Badge count is accurate (matches the number of unread items)
- [ ] Click bell → notification dropdown/panel opens
- [ ] Each notification shows: message, source (task/product), time
- [ ] Click a notification → navigates to the relevant task/product; notification marked read
- [ ] "Mark all read" button clears badge and marks all as read
- [ ] Badge disappears after all notifications marked read

---

## Notification APIs

```bash
# List notifications
curl -s -b alice-cookies.txt $BASE/api/notifications | jq '.[].message'

# Unread count
curl -s -b alice-cookies.txt $BASE/api/notifications/unread-count | jq .

# Mark one as read
curl -s -b alice-cookies.txt -X PATCH $BASE/api/notifications/read \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $ALICE_CSRF" \
  -d '{"notificationIds":["<notif-id>"]}' | jq .

# Mark all read
curl -s -b alice-cookies.txt -X POST $BASE/api/notifications/read-all \
  -H "X-CSRF-Token: $ALICE_CSRF" | jq .

# Delete one notification
curl -s -b alice-cookies.txt -X DELETE $BASE/api/notifications/<notif-id> \
  -H "X-CSRF-Token: $ALICE_CSRF" | jq .

# Delete all notifications
curl -s -b alice-cookies.txt -X DELETE $BASE/api/notifications \
  -H "X-CSRF-Token: $ALICE_CSRF" | jq .
```

- [ ] `GET /api/notifications` returns array of notification objects
- [ ] `GET /api/notifications/unread-count` returns `{ count: N }`
- [ ] `PATCH /api/notifications/read` marks specific notifications as read
- [ ] `POST /api/notifications/read-all` marks all as read
- [ ] `DELETE /api/notifications/:id` deletes one
- [ ] `DELETE /api/notifications` deletes all

---

## Real-time delivery

- [ ] Assign task to Alice → Alice's bell badge increments without page reload (WebSocket)
- [ ] Bell count is accurate in real time

---

## Admin notifications (`/api/admin/notifications`)

```bash
curl -s -b cookies.txt $BASE/api/admin/notifications | jq .
curl -s -b cookies.txt $BASE/api/admin/notifications/unread-count | jq .
```

- [ ] Admin has a separate notification feed for server-level events
- [ ] Non-admin → 403

---

## Notification preferences (`PATCH /api/users/:id/notification-preferences`)

```bash
curl -s -b alice-cookies.txt -X PATCH $BASE/api/users/<alice-id>/notification-preferences \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $ALICE_CSRF" \
  -d '{"taskAssigned":true,"mentioned":false,"comments":true}' | jq .
```

- [ ] Open notification preferences modal
- [ ] Toggle off "task assigned" → assigning Alice a task does NOT create a notification
- [ ] Toggle on "mentioned" → mentioning Alice creates a notification
- [ ] Preferences persist after reload

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
