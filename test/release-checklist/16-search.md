# 16 - Search

← [Back to index](README.md)

---

## Global search (UI)

> Code: [frontend/src/components/common/SearchModal.tsx](../../frontend/src/components/common/SearchModal.tsx) (Cmd+K modal: quick-nav items when empty, live debounced API call, keyboard navigation with arrow keys, result-click routing and close)

- [ ] Open search with keyboard shortcut (Ctrl+K / Cmd+K)
- [ ] Search button in top bar also opens search
- [ ] Escape closes the modal
- [ ] Click backdrop closes the modal
- [ ] Quick-nav items shown when query is empty (e.g. Kanban, Backlog, Admin)
- [ ] Arrow keys navigate through results
- [ ] Enter on highlighted item navigates to it and closes modal

---

## Search API (`GET /api/search`)

> Code: [backend/src/routes/search.ts](../../backend/src/routes/search.ts) (searches tasks and messages using Prisma `contains`; scopes results to products the user belongs to; special regex chars are safe because Prisma parameterizes)

```bash
# Search for a task
curl -s -b cookies.txt "$BASE/api/search?q=my+task" | jq .

# Search for a message
curl -s -b cookies.txt "$BASE/api/search?q=hello+from" | jq .
```

- [ ] Returns results across tasks and messages
- [ ] Results scoped to products the user is a member of
- [ ] Charlie (outsider) searching for Alpha Project content → zero results (not 403)
- [ ] Empty query → 400 or returns empty results (not a 500)
- [ ] Query with special regex characters (`.`, `*`, `+`) → handled safely

---

## Search accuracy

- [ ] Type task name → correct task appears in results
- [ ] Type partial task name → task still appears (prefix/contains search)
- [ ] Type message content → message appears in results
- [ ] Search is case-insensitive
- [ ] Search across all user's products simultaneously

---

## Result navigation

> Code: [frontend/src/components/common/SearchModal.tsx](../../frontend/src/components/common/SearchModal.tsx) (result click handler: routes to Kanban + opens task panel, or routes to chat + scrolls to message)

- [ ] Click task result → navigates to Kanban and opens that task's detail panel
- [ ] Click message result → navigates to the product chat and scrolls to that message
- [ ] After navigation, search modal is closed

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
