# E2E Test Fix Plan

## Current State

**Local (Docker Playwright image `mcr.microsoft.com/playwright:v1.61.1-noble`):**
- 10 admin tests — SKIP (need E2E_ADMIN_EMAIL/PASSWORD secrets, expected)
- 9 auth tests — PASS
- 6 kanban tests — PASS
- 4 task tests — 1 FLAKY (first attempt hangs 120s, retry passes), 3 PASS
- 4 upload tests — 1 FLAKY (first attempt hangs 120s, retry passes), 3 PASS

**CI (GitHub Actions):**
- 10 admin tests — SKIP
- 9 auth tests — PASS
- 6 kanban tests — ALL FAIL in 1.2–2.2s (all 3 attempts each)
- Tasks/uploads — hang at 120s or fail

---

## Root Cause Analysis

### Root Cause 1 — Shared browser context across tests (PRIMARY CAUSE)

The `{ browser }` fixture in Playwright is **worker-scoped**: the same browser instance (and its **default context**) is reused across all tests in the worker. Every call to `browser.newPage()` creates a page in this shared default context.

`auth.spec.ts` has two `test.beforeAll` hooks that register users via `browser.newPage()`:

```ts
// Login describe block
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();   // DEFAULT context
  await registerViaUI(page, email, ...);  // sets token + csrf cookies in default context
  await page.close();                     // page closed, BUT cookies remain in default context!
});
```

After the 9 auth tests complete, the default browser context holds **`lockout_user`'s auth cookies**. Every kanban/tasks/uploads test that follows calls `browser.newPage()` and inherits these cookies.

When `registerViaUI` navigates to `/register`, the server may see an already-authenticated session. Depending on server behavior:
- If the app redirects authenticated users away from `/register` → `page.goto('/register')` lands on `/kanban` → `page.getByLabel(/email/i).fill(...)` waits with no timeout → 120s hang
- If registration proceeds despite existing session → the **token and csrf cookies are overwritten** for the new user — but in CI (slower environment), a race can occur where the product API runs before the new cookies are fully applied → 401 returned → before the `.catch(() => {})` fix, this threw immediately → 1.2s failure

**Evidence:** Both failure screenshots show **"Create a product to get started"** — the user is logged in (avatar visible in header) but has no product. The product API call either ran as the wrong user (lockout_user or a previous kanban user with no product), or silently failed and the page shows the empty state.

### Root Cause 2 — Missing `navigationTimeout` in playwright.config.ts

`playwright.config.ts` sets `timeout: 120_000` but does NOT set `navigationTimeout`. Playwright falls back to using `timeout` for all navigation calls. Any bare `page.goto(url)` (without an explicit `timeout` option) can hang for the full **120 seconds**.

Affected calls:
- `kanban.spec.ts:22` — `await page.goto('/kanban');` (no options at all)
- `auth.fixture.ts` reload — `await page.reload({ waitUntil: 'load', timeout: 20_000 })` ✓ (has timeout)
- `tasks.spec.ts` goto — `await page.goto('/kanban', { ..., timeout: 30_000 })` ✓
- `uploads.spec.ts` goto — same ✓

### Root Cause 3 — `waitForLoadState` without timeout

`page.waitForLoadState(state)` with no `timeout` option inherits `navigationTimeout`, which falls back to `timeout` (120s). A stalled page load consumes the entire test budget.

Affected (before fix commit f80fff0, now fixed):
- `auth.fixture.ts:createProjectViaTopBar` — `await page.waitForLoadState('load');`
- `tasks.spec.ts:setupUserAndProduct` — same
- `uploads.spec.ts:setupAndNavigateToMessages` — same

Status: **FIXED in commit f80fff0** (added `{ timeout: 15_000 }.catch(() => {})`)

### Root Cause 4 — `createProjectViaTopBar` evaluate throws on API failure

Before commit f80fff0, the `page.evaluate()` in `createProjectViaTopBar` had explicit `throw new Error(...)` calls and no `.catch()`. A fast API error (401, 403, 429) caused an immediate throw that propagated up to the test, failing it in ~1.2s.

Status: **FIXED in commit f80fff0** (removed throws, added early `return`, added `.catch(() => {})`)

### Root Cause 5 — `waitForFunction` swallows its timeout silently

```ts
await page.waitForFunction(() => {
  // looks for .kanban-col with "New task" button
}, { timeout: 35_000 }).catch(() => {});
```

If the column was NOT created (because the product API silently failed), `waitForFunction` waits 35s then is swallowed by `.catch()`. Execution continues. The test then hits `expect(addTaskBtn).toBeVisible({ timeout: 15_000 })`, waits another 15s, and fails. Combined with other step timeouts, this can consume the full 120s test budget.

### Root Cause 6 — No explicit `actionTimeout` in playwright.config.ts

Playwright's `actionTimeout` (for `.click()`, `.fill()`, `.waitFor()`, etc.) defaults to `0` (no timeout) when not set. The test-level `timeout` (120s) is the only protection. Actions on missing elements can hang for the full 120s.

---

## Fix Checklist

### HIGH PRIORITY — Fix the shared context problem (Root Cause 1)

- [x] **1a. Add `clearCookies()` after every `browser.newPage()` in setup functions**

  Add `await page.context().clearCookies();` immediately after `browser.newPage()` in:
  - `kanban.spec.ts` → `loginAndGoToKanban()`
  - `tasks.spec.ts` → `setupUserAndProduct()`
  - `uploads.spec.ts` → `setupAndNavigateToMessages()`
  - `auth.spec.ts` → both `test.beforeAll` hooks (Login and Login lockout)

  This ensures each test setup starts with no leftover auth from previous tests.

  ```ts
  // BEFORE
  const page = await browser.newPage();
  await registerViaUI(page, u.email, u.username, u.password);

  // AFTER
  const page = await browser.newPage();
  await page.context().clearCookies();  // clear leftover cookies from previous tests
  await registerViaUI(page, u.email, u.username, u.password);
  ```

- [ ] **1b. Add `page.close()` in finally blocks** so pages are closed even on test failure

  Currently, if a test times out before reaching `await page.close()`, the page stays open in the default context. On retry, there are now TWO pages in the default context.

  ```ts
  // Each test that creates its own page should use try/finally:
  const { page } = await loginAndGoToKanban(browser);
  try {
    // ... test assertions ...
  } finally {
    await page.close();
  }
  ```

### HIGH PRIORITY — Add `navigationTimeout` to playwright.config.ts (Root Cause 2)

- [x] **2. Set `navigationTimeout: 30_000` in playwright.config.ts**

  ```ts
  export default defineConfig({
    timeout: 120_000,
    expect: { timeout: 8_000 },
    navigationTimeout: 30_000,  // ADD THIS — caps all page.goto() calls at 30s
    // ...
  });
  ```

  This caps ALL page navigation (goto, reload, goBack) at 30s without needing to pass `{ timeout }` everywhere.

### HIGH PRIORITY — Fix bare goto in kanban.spec.ts (Root Cause 2)

- [x] **3. Add options to `page.goto('/kanban')` in `loginAndGoToKanban`**

  ```ts
  // BEFORE (kanban.spec.ts:22)
  await page.goto('/kanban');

  // AFTER
  await page.goto('/kanban', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  ```

### MEDIUM PRIORITY — Make product creation verifiable (Root Cause 5)

- [x] **4. After the product-creation evaluate, verify the product exists before navigating**

  Instead of silently catching all errors, verify the product was created:

  ```ts
  // In setupUserAndProduct (tasks.spec.ts) and setupAndNavigateToMessages (uploads.spec.ts):
  let productCreated = false;
  await page.evaluate(async () => {
    // ... API calls ...
    productCreated = true;  // can't pass back directly, but check via API after
  }).catch(() => {});

  // After the evaluate, check via a follow-up evaluate:
  const hasProduct = await page.evaluate(async () => {
    const r = await fetch('/api/products');
    if (!r.ok) return false;
    const products = await r.json();
    return Array.isArray(products) && products.length > 0;
  }).catch(() => false);

  if (!hasProduct) {
    // Product wasn't created — don't proceed, let test fail fast with clear error
    throw new Error('Setup failed: product not created. Auth cookie may be missing or API call failed.');
  }
  ```

  This gives a clear error instead of silently producing the "Create a product to get started" failure.

### MEDIUM PRIORITY — Fix `actionTimeout` (Root Cause 6)

- [x] **5. Set `actionTimeout: 15_000` in playwright.config.ts**

  ```ts
  export default defineConfig({
    timeout: 120_000,
    expect: { timeout: 8_000 },
    navigationTimeout: 30_000,
    use: {
      actionTimeout: 15_000,  // ADD THIS — caps all actions at 15s
      // ...
    },
  });
  ```

  This prevents element-wait loops from consuming the full 120s.

### LOW PRIORITY — Investigate COOKIE_SECURE in CI

- [ ] **6. Verify COOKIE_SECURE is working correctly after the docker-compose.yml fix**

  With `COOKIE_SECURE: "${COOKIE_SECURE:-true}"` in docker-compose.yml and `COOKIE_SECURE=false` in the CI .env, the backend should now set non-Secure cookies. Verify this is active in the next CI run by checking if auth tests still pass (they use `{ page }` fixture which is already isolated and not affected by the shared context bug).

  Note: Chrome treats `http://localhost` as a "potentially trustworthy origin" so Secure cookies SHOULD work even without this change, but having it explicit is safer.

### LOW PRIORITY — Investigate uploads "Target page closed" error

- [ ] **7. Understand why `uploads.spec.ts:201` (persistence test) gets "Target page context or browser has been closed"**

  This error happens when a page object is used after the browser has been closed or the context disposed. Most likely triggered by:
  - Server-side crash or restart mid-test
  - Browser becoming unstable after many tests
  - The page being closed by a previous test cleanup that didn't use try/finally

  Fixing Root Cause 1 (clearCookies + try/finally) will likely also fix this.

---

## Implementation Order

1. Fix playwright.config.ts — add `navigationTimeout` and `actionTimeout` (2 lines, no test logic changes)
2. Fix `clearCookies()` in all setup functions + auth.spec.ts `beforeAll` hooks
3. Fix `page.goto('/kanban')` in kanban.spec.ts
4. Add product verification in tasks/uploads setup
5. Add try/finally in all tests that create their own page

---

## Expected Outcome After Fixes

| Test group         | Before    | After     |
|--------------------|-----------|-----------|
| Admin (10)         | SKIP      | SKIP      |
| Auth (9)           | PASS      | PASS      |
| Kanban (6) in CI   | FAIL 1.2s | PASS      |
| Tasks (4)          | 1 FLAKY   | PASS      |
| Uploads (4)        | 1 FLAKY   | PASS      |

---

## What Was Already Fixed

| Commit  | Fix |
|---------|-----|
| `a4d19f9` | `waitForLoadState('load')` before `page.evaluate()` in createProjectViaTopBar |
| `a4d19f9` | `domcontentloaded` + 30s timeout on page.goto('/kanban') in tasks/uploads setup |
| `a4d19f9` | COOKIE_SECURE=false in CI .env file |
| `a4d19f9` | docker-compose.yml passes COOKIE_SECURE via `${COOKIE_SECURE:-true}` |
| `a4d19f9` | RATE_LIMIT_LOGIN/REGISTER_MAX=1000 in CI .env |
| `a4d19f9` | Remove e2e/test-results from git tracking |
| `f80fff0` | `{ timeout: 15_000 }.catch(() => {})` on all waitForLoadState calls |
| `f80fff0` | `.catch(() => {})` + AbortController + silent early return in createProjectViaTopBar evaluate |
| `88b579e` | `apk upgrade --no-cache` in nginx Dockerfile — fixes libexpat CVEs |
| `89edb8a` | tasks.spec.ts: replace page.request race w/ createProjectViaTopBar+waitForKanbanReady+createColumnOnKanban |
| `89edb8a` | uploads.spec.ts: switch to page.request API setup (race doesn't affect uploads, runs later in suite) |
| `89edb8a` | auth.fixture.ts: extract createProjectViaTopBar/waitForKanbanReady/createColumnOnKanban as exports |
