# 01 — Test Setup

← [Back to index](README.md)

Create these accounts and resources before any other section. Everything in the plan refers back to them by name.

---

## Prerequisites

- [ ] App is running: `docker compose up --build` (or prod stack)
- [ ] You can reach `http://localhost` in a browser
- [ ] `curl` is available in terminal
- [ ] SMTP is configured or you have access to the backend logs to see emails
- [ ] You have set `ADMIN_EMAIL=<your-email>` in `.env` before first start

---

## Environment variables for curl testing

Set these in your terminal session. Every `curl` command in later sections uses them:

```bash
BASE=http://localhost
ADMIN_EMAIL=<your-admin-email>
ADMIN_PASS=<admin-password>
```

---

## Test accounts to create

Create all four accounts via the registration UI, then adjust roles as noted.

### Account A — Founding Admin
| Field | Value |
|---|---|
| Email | your ADMIN_EMAIL |
| Username | `admin` |
| Role | Server admin (set via ADMIN_EMAIL env) |

- [ ] Log in and confirm the shield button 🛡 is visible

### Account B — Regular member (Alice)
| Field | Value |
|---|---|
| Email | `alice@test.local` |
| Username | `alice` |
| Role | Regular user, no admin rights |

- [ ] Register via UI
- [ ] Confirm no shield button
- [ ] Confirm `/admin` redirects away

### Account C — Co-owner of Project 1 (Bob)
| Field | Value |
|---|---|
| Email | `bob@test.local` |
| Username | `bob` |
| Role | Regular user; will be made co-owner of one project |

- [ ] Register via UI

### Account D — Outsider (Charlie)
| Field | Value |
|---|---|
| Email | `charlie@test.local` |
| Username | `charlie` |
| Role | Regular user; NOT a member of any project |

- [ ] Register via UI

---

## Test projects to create

Log in as **Admin** and create these:

### Project 1 — "Alpha Project"
- [ ] Create team "Alpha Team" with Admin as owner
- [ ] Invite Alice (member) and Bob (co-owner) to Alpha Team
- [ ] Create project "Alpha Project" under Alpha Team
- [ ] Confirm Alice and Bob both appear in Settings → Team

### Project 2 — "Beta Project"
- [ ] Create team "Beta Team" with Admin as owner only (Charlie NOT invited)
- [ ] Create project "Beta Project" under Beta Team

---

## Test data to create in Alpha Project

- [ ] Create 5 tasks in Alpha Project (used throughout tests)
- [ ] Create 1 sprint "Sprint 1" in Alpha Project
- [ ] Assign 2 tasks to Sprint 1
- [ ] Create 1 custom column "Review"

---

## Tools checklist

- [ ] Browser open at `http://localhost` with Admin session
- [ ] Second browser window (or incognito) for Alice session
- [ ] Third browser window for Charlie (outsider) session
- [ ] Terminal ready with `BASE`, `ADMIN_EMAIL`, `ADMIN_PASS` variables set

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
