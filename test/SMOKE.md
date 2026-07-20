# Smoke Test

~30 minutes. Run this before every production release, after automated tests pass.

Start from a completely fresh instance:

```bash
docker compose down -v && docker compose build --no-cache && docker compose up -d
```

Wait 20 seconds, open [http://localhost](http://localhost).

---

## 1. Setup (5 min)

### Create three accounts via the registration UI

| Account | Email | Username | Notes |
|---|---|---|---|
| Admin | *(your `ADMIN_EMAIL` from `.env`)* | admin | Auto-promoted on first start |
| Alice | alice@test.local | alice | Regular member |
| Charlie | charlie@test.local | charlie | Outsider — never invited |

- [X] Admin → shield 🛡 visible in top bar
- [X] Alice in a second browser window → no shield
- [X] Charlie in a third window → no shield

### Create a project and invite Alice

Log in as Admin:

- [X] **+ New project** → name it "Alpha" → Create
- [X] Settings → Team → invite `alice@test.local`
- [X] Alice accepts in her window → "Alpha" appears in her project picker

---

## 2. Admin mode (3 min)

- [X] Click the shield 🛡 → nav icons turn purple, admin tabs appear in the center nav
- [X] Navigate to Announcements while in admin mode → mode badge shows "🛡 Server Admins"
- [X] Click shield again → returns to `/kanban`, icons return to normal
- [X] Navigate to `/admin` as Alice → silently redirected to `/kanban`

---

## 3. Real-time (5 min)

Open Admin and Alice **side-by-side** on the Kanban board of Alpha:

- [X] Admin creates a task → appears in Alice's board instantly (no reload)
- [X] Admin drags the task to another column → Alice sees it move
- [X] Alice edits the task name → Admin sees the update
- [X] Admin deletes a task → disappears from Alice's board
- [X] Close and reopen Alice's browser tab → reconnects and board is up to date

---

## 4. Drag and drop (2 min)

- [X] Drag a card between columns → status changes, persists on reload
- [X] Drag to reorder within a column → order persists on reload
- [X] Drag a column header to reorder columns → order persists on reload

---

## 5. Announcements (5 min)

**Server-admin announcement:**
- [ ] Enable admin mode → open Announcements → compose icon (pencil) appears
- [ ] Post an announcement: title, markdown body (include a heading and a list), pin it, comments on
- [ ] Pinned announcement appears at top with "🛡 Server Admins" attribution in Alice's window
- [ ] Alice comments → comment appears in Admin's window without reload

**Team announcement:**
- [ ] Disable admin mode → switch to Alpha → open Announcements
- [ ] Mode badge shows "🏢 Alpha"; compose icon present
- [ ] Post a team announcement — **pin toggle must not be visible**
- [ ] Alice sees it with "🏢 Alpha" attribution

**Filter pills:**
- [ ] Two sources exist (server-wide + Alpha) → filter pills appear above the list
- [ ] Clicking each pill filters correctly; "All" restores full list

**Markdown rendering:**
- [ ] Edit an announcement to include: `# Heading`, `**bold**`, a table, a fenced code block
- [ ] All elements render correctly (not raw markdown)

---

## 6. File upload (2 min)

- [ ] Open a task → scroll to comment thread → attach an image file
- [ ] Image thumbnail visible inline in the message
- [ ] Attach a PDF → download link shown, not a broken image
- [ ] Reload the page → attachment still there

---

## 7. Permissions spot-check (3 min)

As Admin, open Settings → Permissions → find Alice:

- Set Kanban to **read** → Save
- [ ] Alice's Kanban board loads but dragging cards does nothing
- [ ] No "+" create-task button visible for Alice

- Set Kanban to **none** → Save
- [ ] Kanban tab disappears entirely from Alice's sidebar

- Reset back to **write** → Save
- [ ] Alice can create and move tasks again

---

## 8. Outsider access (2 min)

As Charlie:

- [ ] Alpha does not appear in Charlie's project picker
- [ ] Direct API request rejected:

```bash
# Copy Alpha's product ID from the URL while logged in as Admin
curl -s http://localhost/api/products/<alpha-id>/tasks \
  -H "Cookie: token=<charlie-token-cookie>" | jq .statusCode
# Expected: 403
```

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
