/**
 * Shared auth fixtures and helpers for Playwright E2E tests.
 *
 * Provides:
 *   - loginViaUI(page, identifier, password) - UI-based login
 *   - loginViaAPI(request, identifier, password) → cookie - fast API login
 *   - registerViaUI(page, email, username, password) - UI-based registration
 *   - TestUser helpers for unique credentials per test run
 */
import { type Page, type APIRequestContext, expect } from '@playwright/test';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost';

export function uniqueUser(prefix = 'e2e') {
  const ts = Date.now().toString(36);
  return {
    email: `${prefix}_${ts}@e2e.test`,
    username: `${prefix}_${ts}`,
    password: 'E2eP@ssw0rd!',
  };
}

export async function loginViaUI(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email or username/i).fill(identifier);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  // Wait for redirect away from login
  await expect(page).not.toHaveURL(/\/login/);
}

export async function registerViaUI(
  page: Page,
  email: string,
  username: string,
  password: string,
) {
  await page.goto('/register');
  const fullName = page.getByLabel(/full name/i);
  if (await fullName.isVisible({ timeout: 2000 }).catch(() => false)) await fullName.fill('E2E Test User');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/^password/i).fill(password);
  const confirmInput = page.getByLabel(/confirm password/i);
  if (await confirmInput.isVisible()) await confirmInput.fill(password);
  // Accept TOS - required before submission
  const tos = page.getByRole('checkbox');
  if (await tos.isVisible()) await tos.check();
  await page.getByRole('button', { name: /register|sign up|create account/i }).click();
  await expect(page).not.toHaveURL(/\/register/);
}

export async function loginViaAPI(
  request: APIRequestContext,
  identifier: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { identifier, password },
  });
  if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  const cookies = res.headers()['set-cookie'] ?? '';
  const match = cookies.match(/token=([^;]+)/);
  if (!match) throw new Error('No token cookie in login response');
  return match[1]!;
}

/**
 * Creates a project via direct API calls (teams + products endpoints).
 * Uses page.request so calls run Node-side with the page's auth cookies
 * automatically included - no browser-evaluate complexity or AbortController.
 * Reloads the page afterwards so ProductContext picks up the new product.
 */
export async function createProjectViaTopBar(page: Page, name = 'E2E Project') {
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => localStorage.setItem('planly_seen_welcome_v1', '1')).catch(() => {});

  // Read the csrf cookie from Chromium's actual store so we can satisfy the
  // double-submit CSRF check on POST calls. page.request omits the Origin header
  // on same-host requests in some CI environments, which skips Layer 1 and
  // triggers Layer 2 (X-CSRF-Token required). We satisfy Layer 2 explicitly.
  const csrfToken = await page.evaluate(
    () => document.cookie.split('; ').find(c => c.startsWith('csrf='))?.split('=')[1] ?? ''
  );

  const meRes = await page.request.get('/api/auth/me');
  if (!meRes.ok()) throw new Error(`auth/me failed: ${meRes.status()}`);
  const { id: userId } = await meRes.json();

  const teamRes = await page.request.post('/api/teams', {
    data: { name: `${name} Team`, memberIds: [userId] },
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (!teamRes.ok()) throw new Error(`create team failed: ${teamRes.status()}`);
  const { id: teamId } = await teamRes.json();

  const prodRes = await page.request.post('/api/products', {
    data: { name, teamId, deadline: '2027-12-31' },
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (!prodRes.ok()) throw new Error(`create product failed: ${prodRes.status()}`);

  await page.reload({ waitUntil: 'load', timeout: 20_000 }).catch(() => {});
  await page.waitForSelector('header', { timeout: 10_000 }).catch(() => {});
}

/**
 * Waits for the Kanban board to be fully interactive after navigating to /kanban.
 * Waits for the "Add column" button OR existing columns to appear, which means
 * both ProductContext and PermissionContext have finished loading.
 * Uses a longer timeout (25s) to handle slow auth/product initialization.
 * If the app transiently redirects to /login, re-navigates to /kanban and retries.
 */
export async function waitForKanbanReady(page: Page, timeout = 25_000) {
  const boardReadyFn = () => {
    if (document.body.textContent?.includes('Create a product to get started')) return false;
    const buttons = Array.from(document.querySelectorAll('button'));
    if (buttons.some(b => b.textContent?.trim() === 'Add column')) return true;
    if (document.querySelector('.kanban-col')) return true;
    return false;
  };
  await page.waitForFunction(boardReadyFn, { timeout }).catch(() => {});
  // If the SPA redirected to /login during auth initialization, navigate back once.
  if (page.url().includes('/login')) {
    await page.goto('/kanban', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
    await page.waitForFunction(boardReadyFn, { timeout: 20_000 }).catch(() => {});
  }
}

/**
 * Creates a kanban column via the "Add column" button on the current /kanban page.
 * Assumes the page is already on /kanban with an active project.
 * Returns silently (no throw) if any step fails — callers should check for .kanban-col separately.
 */
export async function createColumnOnKanban(page: Page, label = 'To Do') {
  const addColBtn = page.getByRole('button', { name: 'Add column' }).first();
  // Short wait: waitForKanbanReady already confirmed this button is visible
  const found = await addColBtn.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
  if (!found) return;
  await addColBtn.click();
  const columnInput = page.getByPlaceholder(/review.*testing/i);
  await columnInput.waitFor({ state: 'visible', timeout: 5_000 });
  await columnInput.fill(label);
  await page.getByRole('button', { name: 'Add column' }).last().click();
  // Modal unmounts when API succeeds → input disappears
  await columnInput.waitFor({ state: 'hidden', timeout: 6_000 }).catch(() => {});
  // Soft wait — don't throw if columns haven't rendered yet
  await page.locator('.kanban-col').first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
}

export async function getAdminCredentials() {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set to run admin E2E tests',
    );
  }
  return { email, password };
}
