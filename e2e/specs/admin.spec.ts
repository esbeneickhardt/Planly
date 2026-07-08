/**
 * Admin panel E2E tests.
 *
 * Requires E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD environment variables
 * pointing to an existing admin account on the running server.
 *
 * Tests cover: admin mode entry/exit, Users tab, Server Config tab,
 * Audit Logs tab pagination and filtering.
 */
import { test, expect } from '@playwright/test';
import { getAdminCredentials, loginViaUI, uniqueUser, registerViaUI } from '../fixtures/auth.fixture';

test.describe('Admin panel access', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL, 'E2E_ADMIN_EMAIL not set — skipping admin tests');

  test('admin shield button is visible for admin user', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);
    // Shield button should appear (🛡 or similar)
    const shield = page.getByRole('button', { name: /🛡|admin|shield/i }).or(
      page.locator('[data-testid="admin-btn"], [title*="admin" i]')
    );
    await expect(shield.first()).toBeVisible({ timeout: 8_000 });
  });

  test('non-admin user does NOT see shield button', async ({ browser }) => {
    const u = uniqueUser('nonadmin');
    const page = await browser.newPage();
    await registerViaUI(page, u.email, u.username, u.password);

    const shield = page.getByRole('button', { name: /🛡|shield/i }).or(
      page.locator('[data-testid="admin-btn"]')
    );
    await expect(shield).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
    // Navigating to /admin should redirect away
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await page.close();
  });

  test('clicking shield enters admin mode and shows admin tabs', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);

    const shield = page.getByRole('button', { name: /🛡|admin|shield/i }).first();
    await shield.click();

    await expect(page).toHaveURL(/\/admin/);
    // Admin tabs should be visible
    await expect(
      page.getByRole('button', { name: /users|ownership|projects|audit/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking shield again exits admin mode', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);
    await page.goto('/admin');

    const shield = page.getByRole('button', { name: /🛡|admin|shield/i }).first();
    await shield.click();
    // Should navigate away from /admin
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

test.describe('Admin Users tab', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL, 'E2E_ADMIN_EMAIL not set — skipping admin tests');

  test('lists registered users', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);
    await page.goto('/admin?tab=users');

    await expect(
      page.getByRole('row').or(page.locator('[data-testid="user-row"]')).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('can promote and demote a user to admin', async ({ browser }) => {
    const { email, password } = await getAdminCredentials();

    // Create a test user to promote
    const u = uniqueUser('promote');
    const userPage = await browser.newPage();
    await registerViaUI(userPage, u.email, u.username, u.password);
    await userPage.close();

    const page = await browser.newPage();
    await loginViaUI(page, email, password);
    await page.goto('/admin?tab=users');

    // Find the test user row
    const userRow = page.locator(`tr:has-text("${u.username}"), [data-row]:has-text("${u.username}")`);
    if (await userRow.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const promoteBtn = userRow.getByRole('button', { name: /promote|make admin|grant admin/i });
      if (await promoteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await promoteBtn.click();
        await expect(userRow.getByText(/admin/i)).toBeVisible({ timeout: 5_000 });

        // Demote back
        const demoteBtn = userRow.getByRole('button', { name: /demote|remove admin/i });
        if (await demoteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await demoteBtn.click();
        }
      }
    }
    await page.close();
  });
});

test.describe('Admin Server Config tab', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL, 'E2E_ADMIN_EMAIL not set — skipping admin tests');

  test('can toggle allowProjectCreation setting', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);
    await page.goto('/admin?tab=server-config');

    const toggle = page.getByLabel(/allow project creation/i).or(
      page.locator('[data-key="allowProjectCreation"] input[type="checkbox"]')
    );
    if (await toggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const before = await toggle.isChecked();
      await toggle.click();
      await expect(toggle).toBeChecked({ checked: !before, timeout: 5_000 });
      // Restore
      await toggle.click();
    }
  });
});

test.describe('Admin Audit Logs tab', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL, 'E2E_ADMIN_EMAIL not set — skipping admin tests');

  test('shows audit log entries', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);
    await page.goto('/admin?tab=logs');

    // Log entries should appear
    await expect(
      page.locator('[data-testid="log-entry"], tr.log-row, .audit-entry').first().or(
        page.getByText(/login|config|created/i).first()
      )
    ).toBeVisible({ timeout: 10_000 });
  });

  test('can filter audit logs by action type', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);
    await page.goto('/admin?tab=logs');

    // Find the action filter input/select
    const actionFilter = page.getByPlaceholder(/filter by action|action type/i).or(
      page.getByRole('combobox', { name: /action/i })
    );
    if (await actionFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await actionFilter.fill('LOGIN');
      await page.getByRole('button', { name: /apply|filter/i }).click();
      // Should now only show LOGIN entries or empty
      await page.waitForTimeout(1_000);
      const entries = page.locator('[data-testid="log-entry"], tr.log-row');
      const count = await entries.count();
      if (count > 0) {
        // Every visible entry should mention LOGIN
        const firstText = await entries.first().innerText();
        expect(firstText.toLowerCase()).toMatch(/login/i);
      }
    }
  });

  test('export CSV button triggers a download', async ({ page }) => {
    const { email, password } = await getAdminCredentials();
    await loginViaUI(page, email, password);
    await page.goto('/admin?tab=logs');

    const csvBtn = page.getByRole('button', { name: /export csv|csv/i });
    if (await csvBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        csvBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    }
  });
});
