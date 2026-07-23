/**
 * Shared auth fixtures and helpers for Playwright E2E tests.
 *
 * Provides:
 *   - loginViaUI(page, identifier, password) - UI-based login
 *   - registerViaUI(page, email, username, password) - UI-based registration
 *   - uniqueUser(prefix) - generates unique test credentials
 *   - getAdminCredentials() - reads E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 */
import { type Page, expect } from '@playwright/test';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost';

/** Generates unique credentials for a test user. */
export function uniqueUser(prefix = 'e2e') {
  const ts = Date.now().toString(36);
  return {
    email: `${prefix}_${ts}@e2e.test`,
    username: `${prefix}_${ts}`,
    password: 'E2eP@ssw0rd!',
  };
}

/** Logs in via the browser UI and waits for the redirect away from /login. */
export async function loginViaUI(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email or username/i).fill(identifier);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Registers via the browser UI and waits for the redirect away from /register. */
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
  const tos = page.getByRole('checkbox');
  if (await tos.isVisible()) await tos.check();
  await page.getByRole('button', { name: /register|sign up|create account/i }).click();
  await expect(page).not.toHaveURL(/\/register/);
}

/** Returns admin credentials from environment variables. */
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
