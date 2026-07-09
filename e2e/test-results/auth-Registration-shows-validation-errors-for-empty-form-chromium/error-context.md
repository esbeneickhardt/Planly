# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Registration >> shows validation errors for empty form
- Location: specs/auth.spec.ts:13:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /register|sign up/i })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img "Planly" [ref=e7]
    - heading "Create account" [level=1] [ref=e8]
    - paragraph [ref=e9]: Start planning your project
  - generic [ref=e10]:
    - generic [ref=e11]:
      - generic [ref=e12]: Full name
      - textbox "Alex Johnson" [ref=e13]
    - generic [ref=e14]:
      - generic [ref=e15]: Username
      - textbox "alexj" [ref=e16]
    - generic [ref=e17]:
      - generic [ref=e18]: Email
      - textbox "alex@example.com" [ref=e19]
    - generic [ref=e20]:
      - generic [ref=e21]: Password
      - textbox "••••••••" [ref=e22]
      - paragraph [ref=e23]: Min 8 characters, at least one number and one special character
    - generic [ref=e24]:
      - generic [ref=e25]: Confirm password
      - textbox "••••••••" [ref=e26]
    - generic [ref=e27] [cursor=pointer]:
      - checkbox "I agree to the Terms of Service and Privacy Policy" [ref=e28]
      - generic [ref=e29]:
        - text: I agree to the
        - link "Terms of Service" [ref=e30]:
          - /url: /terms
        - text: and
        - link "Privacy Policy" [ref=e31]:
          - /url: /privacy
    - button "Create account" [ref=e32] [cursor=pointer]
  - paragraph [ref=e33]:
    - text: Already have an account?
    - link "Sign in" [ref=e34] [cursor=pointer]:
      - /url: /login
```

# Test source

```ts
  1   | /**
  2   |  * Auth E2E tests — registration, login, lockout, forgot password, logout.
  3   |  *
  4   |  * These tests drive the actual browser UI and verify that the complete
  5   |  * authentication flows work end-to-end, including error messages.
  6   |  *
  7   |  * Prerequisite: the app is running (Docker compose or dev server).
  8   |  */
  9   | import { test, expect } from '@playwright/test';
  10  | import { uniqueUser, loginViaUI, registerViaUI } from '../fixtures/auth.fixture';
  11  | 
  12  | test.describe('Registration', () => {
  13  |   test('shows validation errors for empty form', async ({ page }) => {
  14  |     await page.goto('/register');
> 15  |     await page.getByRole('button', { name: /register|sign up/i }).click();
      |                                                                   ^ Error: locator.click: Test timeout of 30000ms exceeded.
  16  |     // Expect some validation feedback
  17  |     const errors = page.locator('[role="alert"], .error, [data-error]');
  18  |     await expect(errors.first()).toBeVisible({ timeout: 5_000 });
  19  |   });
  20  | 
  21  |   test('rejects a duplicate email with a clear error', async ({ page }) => {
  22  |     const { email, username, password } = uniqueUser('reg_dup');
  23  |     // Register the first time
  24  |     await registerViaUI(page, email, username, password);
  25  |     // Register again with same email, different username
  26  |     await registerViaUI(page, email, `${username}2`, password).catch(() => {});
  27  |     // Should still be on the register page or show an error
  28  |     const body = await page.content();
  29  |     expect(body.toLowerCase()).toMatch(/already|exists|taken|duplicate/);
  30  |   });
  31  | 
  32  |   test('successful registration redirects to app', async ({ page }) => {
  33  |     const { email, username, password } = uniqueUser('reg_ok');
  34  |     await registerViaUI(page, email, username, password);
  35  |     // Should land on kanban, onboarding modal, or similar
  36  |     await expect(page).not.toHaveURL(/\/(register|login)/);
  37  |   });
  38  | });
  39  | 
  40  | test.describe('Login', () => {
  41  |   let email: string;
  42  |   let username: string;
  43  |   let password: string;
  44  | 
  45  |   test.beforeAll(async ({ browser }) => {
  46  |     ({ email, username, password } = uniqueUser('login_user'));
  47  |     const page = await browser.newPage();
  48  |     await registerViaUI(page, email, username, password);
  49  |     await page.close();
  50  |   });
  51  | 
  52  |   test('can log in with email', async ({ page }) => {
  53  |     await loginViaUI(page, email, password);
  54  |     await expect(page).not.toHaveURL(/\/login/);
  55  |   });
  56  | 
  57  |   test('can log in with username', async ({ page }) => {
  58  |     await loginViaUI(page, username, password);
  59  |     await expect(page).not.toHaveURL(/\/login/);
  60  |   });
  61  | 
  62  |   test('wrong password shows error message', async ({ page }) => {
  63  |     await page.goto('/login');
  64  |     await page.getByLabel(/email or username/i).fill(email);
  65  |     await page.getByLabel(/^password/i).fill('wrong-password-xyz');
  66  |     await page.getByRole('button', { name: /log in/i }).click();
  67  |     await expect(page.locator('[role="alert"], .error, [data-error]').first()).toBeVisible();
  68  |     await expect(page).toHaveURL(/\/login/);
  69  |   });
  70  | 
  71  |   test('logout redirects to login page', async ({ page }) => {
  72  |     await loginViaUI(page, email, password);
  73  |     // Find and click logout — usually in a user menu or settings
  74  |     const logoutBtn = page.getByRole('button', { name: /log out|sign out/i });
  75  |     if (await logoutBtn.isVisible()) {
  76  |       await logoutBtn.click();
  77  |     } else {
  78  |       // Try navigating to /logout directly
  79  |       await page.goto('/logout');
  80  |     }
  81  |     await expect(page).toHaveURL(/\/login/);
  82  |   });
  83  | });
  84  | 
  85  | test.describe('Login lockout', () => {
  86  |   let email: string;
  87  |   let password: string;
  88  | 
  89  |   test.beforeAll(async ({ browser }) => {
  90  |     const u = uniqueUser('lockout_user');
  91  |     email = u.email;
  92  |     password = u.password;
  93  |     const page = await browser.newPage();
  94  |     await registerViaUI(page, email, u.username, password);
  95  |     await page.close();
  96  |   });
  97  | 
  98  |   test('shows remaining attempts warning after wrong passwords', async ({ page }) => {
  99  |     await page.goto('/login');
  100 |     for (let i = 0; i < 3; i++) {
  101 |       await page.getByLabel(/email or username/i).fill(email);
  102 |       await page.getByLabel(/^password/i).fill('wrong-pass');
  103 |       await page.getByRole('button', { name: /log in/i }).click();
  104 |       await page.waitForTimeout(300);
  105 |     }
  106 |     // Should see remaining attempts or lockout warning
  107 |     const body = await page.content();
  108 |     expect(body.toLowerCase()).toMatch(/attempt|remaining|locked|lockout/);
  109 |   });
  110 | });
  111 | 
  112 | test.describe('Session persistence', () => {
  113 |   test('stays logged in after page refresh', async ({ page }) => {
  114 |     const u = uniqueUser('persist');
  115 |     await registerViaUI(page, u.email, u.username, u.password);
```