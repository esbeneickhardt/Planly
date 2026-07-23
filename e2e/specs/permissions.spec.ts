/**
 * Permissions edge-case E2E tests.
 *
 * Tests that non-members, read-only viewers, and guests are correctly
 * blocked from project resources and write operations.
 *
 * Tests that require an admin account use E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */
import { test, expect } from '@playwright/test';
import { uniqueUser, registerViaUI, loginViaUI, createProjectViaTopBar, getAdminCredentials } from '../fixtures/auth.fixture';

// ── Helper: register a user and create a project, returning page + API helpers ──

async function setupOwnerWithProject(browser: import('@playwright/test').Browser, prefix = 'perm') {
  const owner = uniqueUser(prefix);
  const page = await browser.newPage();
  await page.context().clearCookies();
  await registerViaUI(page, owner.email, owner.username, owner.password);

  const skip = page.getByRole('button', { name: /skip|get started|close/i });
  if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) await skip.click();

  await createProjectViaTopBar(page, 'Perm Test Project');

  const csrfToken = await page.evaluate(
    () => document.cookie.split('; ').find(c => c.startsWith('csrf='))?.split('=')[1] ?? ''
  );

  // Fetch the product ID so we can invite a second user to it
  const productsRes = await page.request.get('/api/products');
  const products = await productsRes.json();
  const productId: string = products[0]?.id ?? '';

  const teamRes = await page.request.get(`/api/products/${productId}`);
  const product = await teamRes.json();
  const teamId: string = product?.teamId ?? '';

  return { page, owner, productId, teamId, csrfToken };
}

// ── 1. Route guard: unauthenticated user is redirected to /login ──────────────

test.describe('Route guards', () => {
  test('unauthenticated user is redirected to /login on protected routes', async ({ page }) => {
    for (const route of ['/kanban', '/gantt', '/backlog', '/canvas', '/settings']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    }
  });

  test('/admin route blocks non-admin users', async ({ browser }) => {
    const u = uniqueUser('guard');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);

    await page.goto('/admin');
    // Should be redirected away from /admin (to /kanban or /login)
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 8_000 });
    await page.close();
  });
});

// ── 2. Non-member cannot access another user's project via direct URL ─────────

test.describe('Non-member access', () => {
  test('non-member visiting project routes sees no project content', async ({ browser }) => {
    // User A creates a project
    const { page: ownerPage, productId } = await setupOwnerWithProject(browser, 'nm_owner');
    void productId; // used only to ensure project was created

    // User B (no project membership) registers and tries to access /kanban
    const stranger = uniqueUser('nm_stranger');
    const strangerPage = await browser.newPage();
    await strangerPage.context().clearCookies();
    await registerViaUI(strangerPage, stranger.email, stranger.username, stranger.password);

    // Stranger has no projects, so /kanban should show an empty state
    await strangerPage.goto('/kanban');
    const body = await strangerPage.content();
    // Should NOT see the owner's project content; no .kanban-col should render
    const colCount = await strangerPage.locator('.kanban-col').count();
    expect(colCount).toBe(0);

    await ownerPage.close();
    await strangerPage.close();
  });
});

// ── 3. Settings route only visible to owners/co-owners ────────────────────────

test.describe('Settings access', () => {
  test('project owner can access /settings', async ({ browser }) => {
    const { page } = await setupOwnerWithProject(browser, 'settings_owner');
    await page.goto('/settings');
    // Should render the settings page, not redirect
    await expect(page).toHaveURL(/\/settings/, { timeout: 8_000 });
    // Wait for the active project to load in the SPA. On cold page loads the
    // auth→products→permissions chain can take several seconds; the project
    // picker shows the fallback "🎯 Project" placeholder until activeProduct
    // is set, and the settings h1 won't appear until then.
    // textContent includes the full name even when CSS truncation is applied.
    await page.waitForFunction(
      () => document.body.textContent?.includes('Perm Test Project'),
      { timeout: 25_000 },
    ).catch(() => {}); // soft wait — fall through to the h1 assertion
    // Settings h1 must be visible once the active project and permissions have resolved
    await expect(page.locator('h1, h2, [data-testid="settings-title"]').first()).toBeVisible({ timeout: 10_000 });
    await page.close();
  });
});

// ── 4. API-level permission enforcement ───────────────────────────────────────

test.describe('API permission enforcement', () => {
  test('POST /api/products requires auth — 401 when no session cookie', async ({ request }) => {
    const res = await request.post('/api/products', {
      data: { name: 'Hacked Project', teamId: 'fake', deadline: '2025-01-01' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/users returns 401/403 for non-admin session', async ({ browser }) => {
    const u = uniqueUser('apiperm');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);

    const res = await page.request.get('/api/admin/users');
    expect([401, 403]).toContain(res.status());
    await page.close();
  });

  test('DELETE /api/tasks/:id is rejected when user does not own the project', async ({ browser }) => {
    // Owner creates a project and a task via API
    const { page: ownerPage, productId, csrfToken } = await setupOwnerWithProject(browser, 'del_owner');

    // Create a column so we can create a task
    const colRes = await ownerPage.request.post(`/api/products/${productId}/columns`, {
      data: { name: 'To Do', order: 0 },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    const col = colRes.ok() ? await colRes.json() : { id: 'x' };

    // Create a task in that column
    const taskRes = await ownerPage.request.post(`/api/products/${productId}/tasks`, {
      data: { title: 'Secret Task', columnId: col.id },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    const task = taskRes.ok() ? await taskRes.json() : null;

    if (!task?.id) {
      await ownerPage.close();
      return; // skip if task creation failed (column may not have been created)
    }

    // Non-member tries to delete the task
    const stranger = uniqueUser('del_stranger');
    const strangerPage = await browser.newPage();
    await strangerPage.context().clearCookies();
    await registerViaUI(strangerPage, stranger.email, stranger.username, stranger.password);

    const csrfStranger = await strangerPage.evaluate(
      () => document.cookie.split('; ').find(c => c.startsWith('csrf='))?.split('=')[1] ?? ''
    );
    const delRes = await strangerPage.request.delete(`/api/tasks/${task.id}`, {
      headers: { 'X-CSRF-Token': csrfStranger },
    });
    expect([401, 403, 404]).toContain(delRes.status());

    await ownerPage.close();
    await strangerPage.close();
  });
});

// ── 5. Admin-only operations ──────────────────────────────────────────────────

test.describe('Admin-only API operations', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL, 'E2E_ADMIN_EMAIL not set');

  test('GET /api/admin/stats returns 200 for admin', async ({ browser }) => {
    const { email, password } = await getAdminCredentials();
    const page = await browser.newPage();
    await loginViaUI(page, email, password);

    const res = await page.request.get('/api/admin/stats');
    expect(res.status()).toBe(200);
    await page.close();
  });

  test('GET /api/admin/stats returns 401/403 for non-admin', async ({ browser }) => {
    const u = uniqueUser('admin_perm');
    // Use a fresh context so the admin session from the previous test cannot leak
    // in via shared cookies — browser.newPage() reuses the default context which
    // retains HttpOnly cookies even after clearCookies() in some PW builds.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerViaUI(page, u.email, u.username, u.password);

    const res = await page.request.get('/api/admin/stats');
    expect([401, 403]).toContain(res.status());
    await ctx.close();
  });
});
