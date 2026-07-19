# 14 - Announcements

← [Back to index](README.md)

Requires `announcementsEnabled: true` in Admin → Server Config.

---

## Announcements API

> Code: [backend/src/routes/announcements.ts](../../backend/src/routes/announcements.ts) (CRUD + comments; checks `announcementsEnabled` and `announcementPostRole` from server config before allowing create) · [backend/src/utils/server-config.ts](../../backend/src/utils/server-config.ts) (`announcementsEnabled`, `announcementPostRole` defaults)

```bash
# Create announcement (admin or privileged user)
curl -s -b cookies.txt -X POST $BASE/api/announcements \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"title":"Welcome to Planly!","content":"**Hello world** - this is a test announcement.","pinned":false,"commentsEnabled":true,"teamId":"<team-id>"}' | jq .

# List announcements
curl -s -b cookies.txt $BASE/api/announcements | jq '.[].title'

# Update announcement
curl -s -b cookies.txt -X PATCH $BASE/api/announcements/<ann-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"pinned":true}' | jq .

# Delete announcement
curl -s -b cookies.txt -X DELETE $BASE/api/announcements/<ann-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

---

## Creating announcements

> Code: [backend/src/routes/announcements.ts](../../backend/src/routes/announcements.ts) (role check: if `announcementPostRole === "admin"` only admins can POST)

- [ ] Admin can create an announcement (title, markdown body)
- [ ] Regular member cannot create announcement (if `announcementPostRole` = admin) → 403
- [ ] `announcementPostRole: "member"` → any member can create
- [ ] Markdown in body renders correctly (bold, headers, links, code blocks)
- [ ] XSS: `<script>alert(1)</script>` in body renders as literal text (not executed)
- [ ] `<img onerror="...">` in body does not execute the handler

---

## Viewing announcements

> Code: [frontend/src/pages/AnnouncementsPage.tsx](../../frontend/src/pages/AnnouncementsPage.tsx) (pinned-first sort, "Read more" expand, author/date display)

- [ ] Announcements page shows all announcements for the user's teams
- [ ] Body collapsed to ~96px height when long; "Read more" expands it
- [ ] "Read more" / "Show less" toggle works
- [ ] Pinned announcement shown at top
- [ ] Unpinned announcements in reverse-chronological order
- [ ] Author name and date shown on each announcement

---

## Pinning

> Code: [backend/src/routes/announcements.ts](../../backend/src/routes/announcements.ts) (PATCH `pinned` field) · [frontend/src/pages/AnnouncementsPage.tsx](../../frontend/src/pages/AnnouncementsPage.tsx) (pin indicator, pinned-first ordering)

- [ ] Pin an announcement → it appears at the top of the list with a pin indicator
- [ ] Unpin → it moves back to chronological position
- [ ] Multiple announcements can be pinned; pinned ones shown before unpinned

---

## Comments (`/announcements/:id/comments`)

> Code: [backend/src/routes/announcements.ts](../../backend/src/routes/announcements.ts) (comment sub-routes: POST/GET/DELETE; author can delete own; admin can delete any; regular member cannot delete others → 403)

```bash
# Post a comment
curl -s -b cookies.txt -X POST $BASE/api/announcements/<ann-id>/comments \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"content":"Great announcement!"}' | jq .

# List comments
curl -s -b cookies.txt $BASE/api/announcements/<ann-id>/comments | jq '.[].content'

# Delete comment
curl -s -b cookies.txt -X DELETE $BASE/api/announcements/<ann-id>/comments/<comment-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Comments section appears when `commentsEnabled: true` on the announcement
- [ ] Comments section hidden when `commentsEnabled: false`
- [ ] Post a comment → appears below announcement
- [ ] Comment count shown in the header
- [ ] Can delete own comment
- [ ] Admin can delete any comment
- [ ] Regular member cannot delete another member's comment → 403

---

## Announcements disabled

> Code: [backend/src/utils/server-config.ts](../../backend/src/utils/server-config.ts) (`announcementsEnabled`) · [frontend/src/components/common/AppLayout.tsx](../../frontend/src/components/common/AppLayout.tsx) (hides Announcements nav entry when disabled) · [backend/src/routes/announcements.ts](../../backend/src/routes/announcements.ts) (checks flag before returning data)

- [ ] Set `announcementsEnabled: false` in Admin → Server Config
- [ ] Announcements tab disappears from navigation for all users
- [ ] Re-enable → Announcements tab reappears

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
