/**
 * Shared auth fixtures and helpers for Playwright E2E tests.
 *
 * Provides:
 *   - loginViaUI(page, identifier, password) — UI-based login
 *   - loginViaAPI(request, identifier, password) → cookie — fast API login
 *   - registerViaUI(page, email, username, password) — UI-based registration
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
  await page.getByRole('button', { name: /log in/i }).click();
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
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/^password/i).fill(password);
  const confirmInput = page.getByLabel(/confirm password/i);
  if (await confirmInput.isVisible()) await confirmInput.fill(password);
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
