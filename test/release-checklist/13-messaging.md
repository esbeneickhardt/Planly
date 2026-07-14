# 13 — Messaging & Chat

← [Back to index](README.md)

---

## Product chat (`/api/products/:productId/messages`)

> Code: [backend/src/routes/messages.ts](../../backend/src/routes/messages.ts) (CRUD + reactions; `?taskId=` param separates task threads from product chat) · [frontend/src/components/common/ChatPanel.tsx](../../frontend/src/components/common/ChatPanel.tsx) (compose textarea, file-attach button, emoji picker, message list) · [frontend/src/components/common/MessageBubble.tsx](../../frontend/src/components/common/MessageBubble.tsx) (individual message: author, timestamp, markdown, reactions, edit/delete)

```bash
# Send a message
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/messages \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"content":"Hello from the API"}' | jq .

# List messages
curl -s -b cookies.txt "$BASE/api/products/$PRODUCT_ID/messages?limit=20" | jq '.[].content'

# Edit a message (author only)
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/messages/<msg-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"content":"Edited content"}' | jq .

# Delete a message
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/messages/<msg-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

### Sending messages

- [ ] Type message in chat panel → press Enter → message appears
- [ ] Message shows author username, avatar, timestamp
- [ ] Long messages wrap correctly; very short messages look reasonable
- [ ] Markdown is rendered (bold, code, links, lists)
- [ ] `@username` mentions highlight the mentioned user

### Edit & delete

> Code: [backend/src/routes/messages.ts](../../backend/src/routes/messages.ts) (PATCH: author-only; DELETE: author or co-owner) · [frontend/src/hooks/useMessageEdit.ts](../../frontend/src/hooks/useMessageEdit.ts) (inline edit state)

- [ ] Hover over own message → edit and delete icons appear
- [ ] Click edit → message text becomes editable inline
- [ ] Save edit → "(edited)" suffix shown
- [ ] Cannot edit another user's message
- [ ] Click delete → confirm → message removed
- [ ] Author OR co-owner can delete messages
- [ ] Regular member cannot delete another member's message → 403

### Reactions (`/messages/:messageId/reactions`)

> Code: [backend/src/routes/messages.ts](../../backend/src/routes/messages.ts) (POST reaction — toggles: adds if absent, removes if present) · [frontend/src/components/common/MessageBubble.tsx](../../frontend/src/components/common/MessageBubble.tsx) (emoji picker, reaction pill display)

```bash
# Add reaction
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/messages/<msg-id>/reactions \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"emoji":"👍"}' | jq .
```

- [ ] Click emoji picker → add reaction → emoji+count shown
- [ ] Click same emoji again → reaction removed (toggle)
- [ ] Multiple users react → count increments
- [ ] Reaction from other user visible in real time (WebSocket)

---

## Task-level comments

> Code: [backend/src/routes/messages.ts](../../backend/src/routes/messages.ts) (`?taskId=<id>` filter on GET/POST isolates task threads) · [frontend/src/components/common/TaskDetailPanel.tsx](../../frontend/src/components/common/TaskDetailPanel.tsx) (comment thread inside detail panel)

- [ ] Task detail panel has a separate comment thread (`taskId` filter)
- [ ] Messages posted in task thread do NOT appear in product chat
- [ ] Messages posted in product chat do NOT appear in task thread
- [ ] All message features (edit, delete, reactions) work in task threads

---

## File attachments

> Code: [backend/src/index.ts](../../backend/src/index.ts) or upload route (`POST /api/upload` — multipart, MIME allowlist, 50 MB limit) · [frontend/src/components/common/ChatPanel.tsx](../../frontend/src/components/common/ChatPanel.tsx) (file input, auto-upload on select) · [frontend/src/components/common/MessageBubble.tsx](../../frontend/src/components/common/MessageBubble.tsx) (image thumbnail vs download link)

- [ ] Upload an image file via chat → thumbnail preview shown in message
- [ ] Click image thumbnail → lightbox opens
- [ ] Upload a PDF or other file → download link shown (not inline preview)
- [ ] File size limit: files > 50 MB should be rejected with clear error
- [ ] MIME type validation: `.exe` or other non-allowed types rejected
- [ ] File is accessible at `/api/uploads/<filename>` for authorized users
- [ ] File deleted when message is deleted (or confirmed orphan cleanup runs)

```bash
# Upload a file
curl -s -b cookies.txt -X POST $BASE/api/upload \
  -H "X-CSRF-Token: $CSRF" \
  -F "file=@/path/to/test-image.png" | jq .

# Get uploaded file
curl -s -b cookies.txt $BASE/api/uploads/<filename> -o /tmp/test-download.png
```

- [ ] Upload returns `{ url, name, type }`
- [ ] URL is accessible to authorized users
- [ ] URL is not accessible without authentication → 401
- [ ] Delete upload: `DELETE /api/uploads/<filename>` → file removed
- [ ] Cannot delete another user's upload → 403

---

## WebSocket real-time

> Code: [backend/src/realtime/manager.ts](../../backend/src/realtime/manager.ts) (broadcasts message events to all clients in the product room) · [frontend/src/hooks/useRealtimeUpdates.ts](../../frontend/src/hooks/useRealtimeUpdates.ts) (handles `message.created`, `message.updated`, `message.deleted`, `reaction.toggled`)

Open Alpha Project chat in two browser windows (Admin and Alice):

- [ ] Admin sends message → appears in Alice's window without reload
- [ ] Alice sends message → appears in Admin's window without reload
- [ ] Edit message → updated in the other window
- [ ] Delete message → removed from the other window in real time
- [ ] React → reaction count updates in the other window

### WebSocket ticket (`POST /api/products/:id/ws-ticket`)

> Code: [backend/src/realtime/ws-tickets.ts](../../backend/src/realtime/ws-tickets.ts) (generates short-lived ticket; 30 s TTL; validates membership before issuing) · [backend/src/routes/realtime.ts](../../backend/src/routes/realtime.ts) (WS upgrade validates ticket, then upgrades to WebSocket)

```bash
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/ws-ticket \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Returns a short-lived ticket (TTL ~ 30 seconds)
- [ ] Ticket is used to establish WS connection (no JWT in query params)
- [ ] Non-member cannot get a ticket → 403
- [ ] Expired ticket rejected on WS upgrade

---

## Messages pagination

> Code: [backend/src/routes/messages.ts](../../backend/src/routes/messages.ts) (`?limit=N&before=<msgId>` cursor pagination) · [frontend/src/components/common/ChatPanel.tsx](../../frontend/src/components/common/ChatPanel.tsx) (infinite scroll trigger)

```bash
curl -s -b cookies.txt "$BASE/api/products/$PRODUCT_ID/messages?limit=5&before=<msg-id>" | jq .
```

- [ ] Messages load in batches (most recent first or oldest first — confirm direction)
- [ ] Scroll to top of chat → older messages load (infinite scroll)
- [ ] `before` cursor parameter works
- [ ] All messages eventually accessible by scrolling

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
