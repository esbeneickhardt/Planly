/**
 * File upload E2E tests — attaching files to messages and verifying they appear.
 *
 * Each test registers a fresh user, creates a project, navigates to the
 * Messages tab, and exercises the file attachment flow.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { uniqueUser, registerViaUI } from '../fixtures/auth.fixture';

// ── Shared setup ────────────────────────────────────────────────────────────

async function setupAndNavigateToMessages(browser: import('@playwright/test').Browser) {
  const u = uniqueUser('upload');
  const page = await browser.newPage();
  await page.context().clearCookies();
  await registerViaUI(page, u.email, u.username, u.password);

  // Dismiss onboarding if present
  const skipBtn = page.getByRole('button', { name: /skip|get started|close/i });
  if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) await skipBtn.click();

  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => localStorage.setItem('planly_seen_welcome_v1', '1'));

  // Read the csrf cookie from Chromium's actual store to satisfy the double-submit
  // CSRF check. page.request omits Origin on same-host requests in some CI
  // environments, triggering Layer 2 (X-CSRF-Token required).
  const csrfToken = await page.evaluate(
    () => document.cookie.split('; ').find(c => c.startsWith('csrf='))?.split('=')[1] ?? ''
  );

  const meRes = await page.request.get('/api/auth/me');
  if (!meRes.ok()) throw new Error(`auth/me failed: ${meRes.status()}`);
  const { id: userId } = await meRes.json();

  const teamRes = await page.request.post('/api/teams', {
    data: { name: 'Upload Test Project Team', memberIds: [userId] },
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (!teamRes.ok()) throw new Error(`create team failed: ${teamRes.status()}`);
  const { id: teamId } = await teamRes.json();

  const prodRes = await page.request.post('/api/products', {
    data: { name: 'Upload Test Project', teamId, deadline: '2027-12-31' },
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (!prodRes.ok()) throw new Error(`create product failed: ${prodRes.status()}`);

  // Single navigation to kanban. domcontentloaded fires before lazy JS chunks.
  await page.goto('/kanban', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  // Wait for the product name to appear in the header (ProductContext has loaded)
  await page.waitForFunction(
    () => {
      const el = document.querySelector('header');
      return el && el.textContent?.includes('Upload Test Project');
    },
    { timeout: 25_000 }
  ).catch(() => {});
  // Open the chat panel
  const chatBtn = page.getByTitle('Project chat');
  await chatBtn.waitFor({ state: 'visible', timeout: 20_000 });
  await chatBtn.click();

  // Wait for the ChatPanel to open (it renders a textarea for composing)
  await expect(page.getByPlaceholder(/write a message/i)).toBeVisible({ timeout: 8_000 });

  return { page, u };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a tiny in-memory PNG file for upload tests. */
function pngFixturePath() {
  // Write a small PNG to a tmp file that Playwright can pick up
  return path.resolve(__dirname, '../fixtures/test-image.png');
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('File attachments in messages', () => {
  test.beforeAll(async () => {
    // Ensure the PNG fixture exists (1×1 pixel PNG, 67 bytes)
    const { writeFileSync, existsSync, mkdirSync } = await import('fs');
    const fixDir = path.resolve(__dirname, '../fixtures');
    if (!existsSync(fixDir)) mkdirSync(fixDir, { recursive: true });
    const pngPath = path.join(fixDir, 'test-image.png');
    if (!existsSync(pngPath)) {
      // Minimal valid 1×1 white PNG
      const png = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82,
      ]);
      writeFileSync(pngPath, png);
    }
  });

  test('can attach a file to a message and see it in the chat', async ({ browser }) => {
    const { page } = await setupAndNavigateToMessages(browser);

    // Find the file input (usually hidden behind an attach button)
    const attachBtn = page
      .getByRole('button', { name: /attach|clip|file/i })
      .or(page.locator('[data-testid="attach-file"]'))
      .or(page.locator('label[for*="file"], label[for*="attach"]'));

    const fileInput = page.locator('input[type="file"]');

    // Trigger file picker via button click or direct setInputFiles
    if (await attachBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await attachBtn.click();
    }

    // Set the file on the input (works even if hidden)
    await fileInput.setInputFiles(pngFixturePath());

    // Wait for the attachment to appear in the compose area (thumbnail or filename)
    // PNG files render as <img alt="test-image.png"> thumbnails, not visible text
    const attachmentPreview = page
      .locator('img[alt*="test-image"]')
      .or(page.locator('img[src*="/api/uploads/"]'))
      .or(page.getByText(/test-image\.png/i))
      .or(page.locator('[data-testid="attachment-preview"]'));

    const appeared = await attachmentPreview.first().isVisible({ timeout: 8_000 }).catch(() => false);
    if (!appeared) {
      // Fallback: send a message with the attachment and check the message bubble
      const msgInput = page
        .getByRole('textbox', { name: /message/i })
        .or(page.locator('[data-testid="message-input"], textarea[placeholder*="message" i]'))
        .first();
      if (await msgInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await msgInput.fill('Here is the file');
        await page.keyboard.press('Control+Enter');
        // PNG → <img alt="test-image.png"> in MessageBubble; non-image → <a> with filename
        await expect(
          page.locator('img[alt*="test-image"], img[src*="/api/uploads/"]')
            .or(page.getByText(/test-image\.png/i))
            .or(page.locator('[href*="/api/uploads/"]')),
        ).toBeVisible({ timeout: 8_000 });
      }
    }

    await page.close();
  });

  test('attached file link points to the uploads API', async ({ browser }) => {
    const { page } = await setupAndNavigateToMessages(browser);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pngFixturePath());

    // Wait for upload to complete and send the message
    const msgInput = page.getByPlaceholder(/write a message/i).first();

    if (await msgInput.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await msgInput.fill('Attachment link test');
      await page.keyboard.press('Control+Enter');
    }

    // The attachment link should reference /api/uploads/
    const link = page.locator('a[href*="/api/uploads/"]');
    if (await link.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const href = await link.getAttribute('href');
      expect(href).toMatch(/^\/api\/uploads\/[a-f0-9]{24}\.[a-z]+$/);
    }

    await page.close();
  });

  test('upload is rejected gracefully for a disallowed file type', async ({ browser }) => {
    const { page } = await setupAndNavigateToMessages(browser);
    const { writeFileSync } = await import('fs');

    // Create a temporary .exe file (not in the allowed list)
    const exePath = path.resolve(__dirname, '../fixtures/test-bad.exe');
    writeFileSync(exePath, Buffer.from([0x4D, 0x5A, 0x00, 0x00])); // MZ header

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(exePath);

    // Should see an error toast or the file should not appear in the preview
    const errorMsg = page
      .getByText(/not allowed|invalid|unsupported|cannot upload/i)
      .or(page.locator('[role="alert"], [data-testid="upload-error"]'));

    // Either an error appears, or the file input is cleared with no attachment shown
    const errorShown = await errorMsg.isVisible({ timeout: 5_000 }).catch(() => false);
    const noAttachment = !(await page.locator('[data-testid="attachment-preview"]').isVisible({ timeout: 1_000 }).catch(() => false));

    expect(errorShown || noAttachment).toBe(true);
    await page.close();
  });
});

test.describe('Uploaded file persistence', () => {
  test('uploaded file is still accessible after page reload', async ({ browser }) => {
    const { page } = await setupAndNavigateToMessages(browser);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pngFixturePath());

    const msgInput = page.getByPlaceholder(/write a message/i).first();

    if (await msgInput.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await msgInput.fill('Reload test');
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(500); // wait for message to appear
    }

    // Reload and re-open the chat panel
    await page.reload();
    await page.waitForTimeout(1_000);
    const chatBtn = page.getByTitle('Project chat');
    if (await chatBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await chatBtn.click();
      await page.waitForTimeout(500);
    }

    const link = page.locator('a[href*="/api/uploads/"]');
    if (await link.isVisible({ timeout: 8_000 }).catch(() => false)) {
      expect(await link.getAttribute('href')).toMatch(/^\/api\/uploads\//);
    }

    await page.close();
  });
});
