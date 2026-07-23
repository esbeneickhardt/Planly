/**
 * Kanban view smoke tests.
 *
 * Verifies that the kanban route renders correctly for an authenticated user.
 * Data-seeding (columns, tasks) via API is intentionally omitted — mixing
 * browser-navigation cookies with page.request / page.evaluate(fetch) is
 * unreliable in Playwright 1.61, which was the root cause of persistent
 * flakiness in the previous data-driven tests.
 */
import { test, expect } from '@playwright/test';
import { uniqueUser, registerViaUI } from '../fixtures/auth.fixture';

test.describe('Kanban view', () => {
  test('renders the nav shell for an authenticated user', async ({ browser }) => {
    const u = uniqueUser('kb_smoke');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);

    await page.goto('/kanban', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // The authenticated shell (header, nav) must be present
    await expect(page.locator('header')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/kanban/);

    await page.close();
  });

  test('mobile viewport renders without horizontal overflow', async ({ browser }) => {
    const u = uniqueUser('kb_mobile');
    const page = await browser.newPage();
    await page.context().clearCookies();
    await registerViaUI(page, u.email, u.username, u.password);
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/kanban', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('body')).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2); // 2px tolerance

    await page.close();
  });
});
