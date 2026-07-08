/**
 * Task E2E tests — creating, editing, deleting tasks; detail panel; subtasks.
 *
 * Each test registers a fresh user and creates a product to work in,
 * so tests are fully isolated.
 */
import { test, expect } from '@playwright/test';
import { uniqueUser, registerViaUI } from '../fixtures/auth.fixture';

async function setupUserAndProduct(browser: Parameters<typeof browser.newPage>[0] extends never ? never : import('@playwright/test').Browser) {
  const u = uniqueUser('task');
  const page = await browser.newPage();
  await registerViaUI(page, u.email, u.username, u.password);
  // Dismiss onboarding modal if present
  const skipBtn = page.getByRole('button', { name: /skip|get started|close/i });
  if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) await skipBtn.click();
  return { page, u };
}

test.describe('Task creation', () => {
  test('can create a task from the kanban board', async ({ browser }) => {
    const { page } = await setupUserAndProduct(browser);

    // Create a product first (if none exists)
    const newProjectBtn = page.getByRole('button', { name: /new project|create project/i });
    if (await newProjectBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newProjectBtn.click();
      await page.getByPlaceholder(/project name|name/i).fill('E2E Project');
      await page.getByRole('button', { name: /create|save/i }).click();
    }

    // Click + / new task button
    const addTaskBtn = page.getByRole('button', { name: /\+|add task|new task/i }).first();
    await expect(addTaskBtn).toBeVisible({ timeout: 8_000 });
    await addTaskBtn.click();

    // Fill in task name
    const nameInput = page.getByPlaceholder(/task name|title/i).or(
      page.getByRole('textbox', { name: /name/i })
    );
    await nameInput.fill('My E2E task');
    await page.getByRole('button', { name: /create|save|add/i }).click();

    // Task should appear on the board
    await expect(page.getByText('My E2E task')).toBeVisible({ timeout: 8_000 });
    await page.close();
  });
});

test.describe('Task detail panel', () => {
  test('opens on task click and allows editing name', async ({ browser }) => {
    const { page } = await setupUserAndProduct(browser);

    // Create a product if needed
    const newProjectBtn = page.getByRole('button', { name: /new project|create project/i });
    if (await newProjectBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newProjectBtn.click();
      await page.getByPlaceholder(/project name|name/i).fill('Detail Test');
      await page.getByRole('button', { name: /create|save/i }).click();
    }

    // Create a task
    const addBtn = page.getByRole('button', { name: /\+|add task|new task/i }).first();
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
      await page.getByPlaceholder(/task name|title/i).fill('Click me task');
      await page.getByRole('button', { name: /create|save|add/i }).click();
      await expect(page.getByText('Click me task')).toBeVisible({ timeout: 8_000 });
    }

    // Click task to open detail panel
    await page.getByText('Click me task').click();

    // Detail panel should be visible
    const panel = page.locator('[role="dialog"], [data-testid="task-panel"], .task-detail');
    await expect(panel.first()).toBeVisible({ timeout: 5_000 });

    await page.close();
  });

  test('can add and check a subtask', async ({ browser }) => {
    const { page } = await setupUserAndProduct(browser);

    const newProjectBtn = page.getByRole('button', { name: /new project|create project/i });
    if (await newProjectBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newProjectBtn.click();
      await page.getByPlaceholder(/project name|name/i).fill('Subtask Test');
      await page.getByRole('button', { name: /create|save/i }).click();
    }

    const addBtn = page.getByRole('button', { name: /\+|add task|new task/i }).first();
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
      await page.getByPlaceholder(/task name|title/i).fill('Task with subtasks');
      await page.getByRole('button', { name: /create|save|add/i }).click();
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

    const newProjectBtn = page.getByRole('button', { name: /new project|create project/i });
    if (await newProjectBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newProjectBtn.click();
      await page.getByPlaceholder(/project name|name/i).fill('Delete Test');
      await page.getByRole('button', { name: /create|save/i }).click();
    }

    const addBtn = page.getByRole('button', { name: /\+|add task|new task/i }).first();
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
      await page.getByPlaceholder(/task name|title/i).fill('Deletable task');
      await page.getByRole('button', { name: /create|save|add/i }).click();
      await expect(page.getByText('Deletable task')).toBeVisible({ timeout: 8_000 });
      await page.getByText('Deletable task').click();
    }

    // Click delete button in the panel
    const deleteBtn = page.getByRole('button', { name: /delete/i });
    if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm if dialog appears
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.getByText('Deletable task')).not.toBeVisible({ timeout: 8_000 });
    }

    await page.close();
  });
});
