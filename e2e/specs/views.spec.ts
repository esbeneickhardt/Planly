/**
 * Gantt and Canvas view smoke tests.
 *
 * Verifies that both view routes render without crashing for an authenticated
 * user. Tests that seeded tasks and asserted their appearance in Gantt bars /
 * Canvas cards were removed - they required project + task creation via mixed
 * browser-navigation and page.request API calls, which is unreliable in
 * Playwright 1.61 due to cookie-store isolation differences between
 * page.request and page.evaluate(fetch).
 */
import { test, expect } from '@playwright/test';
import { uniqueUser, registerViaUI } from '../fixtures/auth.fixture';

test.describe('Gantt view', () => {
  test('renders without crashing for an authenticated user', async ({ browser }) => {
    const u = uniqueUser('gantt_smoke');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);

    await page.goto('/gantt', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await expect(page.locator('header')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/gantt/);
    const errorBoundary = await page.locator('[data-testid="error-boundary"], h1:has-text("Something went wrong")').count();
    expect(errorBoundary).toBe(0);

    await page.close();
  });
});

test.describe('Canvas view', () => {
  test('renders without crashing for an authenticated user', async ({ browser }) => {
    const u = uniqueUser('canvas_smoke');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);

    await page.goto('/canvas', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await expect(page.locator('header')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/canvas/);
    const errorBoundary = await page.locator('[data-testid="error-boundary"], h1:has-text("Something went wrong")').count();
    expect(errorBoundary).toBe(0);

    await page.close();
  });

  test('mobile viewport renders without horizontal overflow', async ({ browser }) => {
    const u = uniqueUser('canvas_mobile');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/canvas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('body')).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(377); // 375 + 2px tolerance

    await page.close();
  });
});
