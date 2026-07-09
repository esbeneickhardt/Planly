import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for Planly.
 *
 * Run against the Docker compose stack (default: http://localhost).
 * Override the URL with E2E_BASE_URL env var when testing against a dev
 * server (e.g. E2E_BASE_URL=http://localhost:5173 npx playwright test).
 *
 * Prerequisites:
 *   docker compose up -d     (or `npm run dev` in frontend + backend)
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars set to a working admin account.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 8_000 },
  navigationTimeout: 30_000,
});
