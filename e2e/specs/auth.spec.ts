/**
 * Auth E2E tests — registration, login, lockout, forgot password, logout.
 *
 * These tests drive the actual browser UI and verify that the complete
 * authentication flows work end-to-end, including error messages.
 *
 * Prerequisite: the app is running (Docker compose or dev server).
 */
import { test, expect } from '@playwright/test';
import { uniqueUser, loginViaUI, registerViaUI } from '../fixtures/auth.fixture';

test.describe('Registration', () => {
  test('shows validation errors for empty form', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: /register|sign up|create account/i }).click();
    // Browser native validation (required fields) or React error state should show
    const hasNativeInvalid = await page.locator('input:invalid').count() > 0;
    const hasAlertEl = await page.locator('[role="alert"], .error, [data-error]').count() > 0;
    expect(hasNativeInvalid || hasAlertEl).toBe(true);
  });

  test('rejects a duplicate email with a clear error', async ({ page }) => {
    const { email, username, password } = uniqueUser('reg_dup');
    // Register the first time
    await registerViaUI(page, email, username, password);
    // Register again with same email, different username
    await registerViaUI(page, email, `${username}2`, password).catch(() => {});
    // Should still be on the register page or show an error
    const body = await page.content();
    expect(body.toLowerCase()).toMatch(/already|exists|taken|duplicate/);
  });

  test('successful registration redirects to app', async ({ page }) => {
    const { email, username, password } = uniqueUser('reg_ok');
    await registerViaUI(page, email, username, password);
    // Should land on kanban, onboarding modal, or similar
    await expect(page).not.toHaveURL(/\/(register|login)/);
  });
});

test.describe('Login', () => {
  let email: string;
  let username: string;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    ({ email, username, password } = uniqueUser('login_user'));
    const page = await browser.newPage();
    await registerViaUI(page, email, username, password);
    await page.close();
  });

  test('can log in with email', async ({ page }) => {
    await loginViaUI(page, email, password);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('can log in with username', async ({ page }) => {
    await loginViaUI(page, username, password);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('wrong password shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email or username/i).fill(email);
    await page.getByLabel(/^password/i).fill('wrong-password-xyz');
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page.locator('[role="alert"], .error, [data-error]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout redirects to login page', async ({ page }) => {
    await loginViaUI(page, email, password);
    // Account avatar is the last button[title] in the header — click it to open the dropdown
    await page.locator('header button[title]').last().click();
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Login lockout', () => {
  let email: string;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    const u = uniqueUser('lockout_user');
    email = u.email;
    password = u.password;
    const page = await browser.newPage();
    await registerViaUI(page, email, u.username, password);
    await page.close();
  });

  test('shows remaining attempts warning after wrong passwords', async ({ page }) => {
    await page.goto('/login');
    for (let i = 0; i < 3; i++) {
      await page.getByLabel(/email or username/i).fill(email);
      await page.getByLabel(/^password/i).fill('wrong-pass');
      await page.getByRole('button', { name: /log in|sign in/i }).click();
      await page.waitForTimeout(300);
    }
    // Should see remaining attempts or lockout warning
    const body = await page.content();
    expect(body.toLowerCase()).toMatch(/attempt|remaining|locked|lockout/);
  });
});

test.describe('Session persistence', () => {
  test('stays logged in after page refresh', async ({ page }) => {
    const u = uniqueUser('persist');
    await registerViaUI(page, u.email, u.username, u.password);
    await page.reload();
    // Should not be redirected to login
    await expect(page).not.toHaveURL(/\/login/);
  });
});
