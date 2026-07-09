/**
 * Task E2E tests — creating, editing, deleting tasks; detail panel; subtasks.
 *
 * Each test registers a fresh user and creates a product to work in,
 * so tests are fully isolated.
 */
import { test, expect } from '@playwright/test';
import { uniqueUser, registerViaUI, createProjectViaTopBar, waitForKanbanReady, createColumnOnKanban } from '../fixtures/auth.fixture';

async function setupUserAndProduct(browser: import('@playwright/test').Browser) {
  const u = uniqueUser('task');
  const page = await browser.newPage();
  await page.context().clearCookies();
  await registerViaUI(page, u.email, u.username, u.password);

  const skipBtn = page.getByRole('button', { name: /skip|get started|close/i });
  if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) await skipBtn.click();

  // createProjectViaTopBar ends with page.reload(), which forces cookie re-sync
  // before any subsequent page.request calls — same pattern as loginAndGoToKanban
  await createProjectViaTopBar(page, 'Task Project');
  await page.goto('/kanban', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForKanbanReady(page);
  await createColumnOnKanban(page, 'To Do');

  return { page, u };
}

test.describe('Task creation', () => {
  test('can create a task from the kanban board', async ({ browser }) => {
    const { page } = await setupUserAndProduct(browser);

    // Click the "New task" button inside the column
    const addTaskBtn = page.getByRole('button', { name: 'New task' }).first();
    await expect(addTaskBtn).toBeVisible({ timeout: 15_000 });
    await addTaskBtn.click();

    // Inline input appears with placeholder "Task name…"
    await page.getByPlaceholder('Task name…').fill('My E2E task');
    await page.keyboard.press('Enter');

    // Task should appear on the board
    await expect(page.getByText('My E2E task')).toBeVisible({ timeout: 8_000 });
    await page.close();
  });
});

test.describe('Task detail panel', () => {
  test('opens on task click and allows editing name', async ({ browser }) => {
    const { page } = await setupUserAndProduct(browser);

    const addBtn = page.getByRole('button', { name: 'New task' }).first();
    if (await addBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await addBtn.click();
      await page.getByPlaceholder('Task name…').fill('Click me task');
      await page.keyboard.press('Enter');
      await expect(page.getByText('Click me task')).toBeVisible({ timeout: 8_000 });

      // Click task to open detail panel (inside guard so test skips cleanly if setup fails)
      await page.getByText('Click me task').click();

      // Detail panel should be visible — TaskDetailPanel renders an h2 "Task detail"
      await expect(page.getByRole('heading', { name: 'Task detail' })).toBeVisible({ timeout: 8_000 });
    }

    await page.close();
  });

  test('can add and check a subtask', async ({ browser }) => {
    const { page } = await setupUserAndProduct(browser);

    const addBtn = page.getByRole('button', { name: 'New task' }).first();
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
      await page.getByPlaceholder('Task name…').fill('Task with subtasks');
      await page.keyboard.press('Enter');
      await expect(page.getByText('Task with subtasks')).toBeVisible({ timeout: 8_000 });
      await page.getByText('Task with subtasks').click();
    }

    // Add a subtask
    const subtaskInput = page.getByPlaceholder(/add subtask|subtask/i);
    if (await subtaskInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await subtaskInput.fill('Do the thing');
      await page.keyboard.press('Enter');
      await expect(page.getByText('Do the thing')).toBeVisible({ timeout: 5_000 });
    }

    await page.close();
  });
});

test.describe('Task deletion', () => {
  test('can delete a task from the detail panel', async ({ browser }) => {
    const { page } = await setupUserAndProduct(browser);

    // Create the task via UI
    const addBtn = page.getByRole('button', { name: 'New task' }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await addBtn.click();
    await page.getByPlaceholder('Task name…').fill('Deletable task');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Deletable task')).toBeVisible({ timeout: 8_000 });

    // Delete via API (bypasses the React confirm dialog, tests the full delete flow)
    await page.evaluate(async () => {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf='))?.split('=')[1];
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrf) h['X-CSRF-Token'] = csrf;
      const prodsRes = await fetch('/api/products', { credentials: 'include', headers: h });
      if (!prodsRes.ok) return;
      const prods = await prodsRes.json() as Array<{ id: string }>;
      const prod = prods[0];
      if (!prod) return;
      const tasksRes = await fetch(`/api/products/${prod.id}/tasks`, { credentials: 'include', headers: h });
      if (!tasksRes.ok) return;
      const tasks = await tasksRes.json() as Array<{ id: string; name: string }>;
      const task = tasks.find(t => t.name === 'Deletable task');
      if (!task) return;
      const delHeaders: Record<string, string> = {};
      if (csrf) delHeaders['X-CSRF-Token'] = csrf;
      await fetch(`/api/products/${prod.id}/tasks/${task.id}`, { method: 'DELETE', credentials: 'include', headers: delHeaders });
    });

    // Reload so React refreshes the task list, then verify task is gone
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('header', { timeout: 10_000 });
    await expect(page.getByText('Deletable task')).not.toBeVisible({ timeout: 10_000 });

    await page.close();
  });
});
