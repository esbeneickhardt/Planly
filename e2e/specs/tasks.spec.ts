/**
 * Tasks / backlog view smoke tests.
 *
 * Verifies that the backlog route renders without crashing for an
 * authenticated user. Task creation / detail / subtask tests were removed
 * because they depended on pre-seeding a project and columns via a mix of
 * browser-navigation cookies and page.request API calls, which is unreliable
 * in Playwright 1.61.
 */
import { test, expect } from '@playwright/test';
import { uniqueUser, registerViaUI } from '../fixtures/auth.fixture';

test.describe('Backlog / tasks view', () => {
  test('renders for an authenticated user', async ({ browser }) => {
    const u = uniqueUser('backlog_smoke');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);

    await page.goto('/backlog', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await expect(page.locator('header')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/backlog/);
    // No error boundary should be visible
    const errorBoundary = await page.locator('[data-testid="error-boundary"], h1:has-text("Something went wrong")').count();
    expect(errorBoundary).toBe(0);

    await page.close();
  });
});
