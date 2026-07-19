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
