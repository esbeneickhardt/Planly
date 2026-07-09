# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Registration >> rejects a duplicate email with a clear error
- Location: specs/auth.spec.ts:21:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/email/i)

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
  1  | /**
  2  |  * Shared auth fixtures and helpers for Playwright E2E tests.
  3  |  *
  4  |  * Provides:
  5  |  *   - loginViaUI(page, identifier, password) — UI-based login
  6  |  *   - loginViaAPI(request, identifier, password) → cookie — fast API login
  7  |  *   - registerViaUI(page, email, username, password) — UI-based registration
  8  |  *   - TestUser helpers for unique credentials per test run
  9  |  */
  10 | import { type Page, type APIRequestContext, expect } from '@playwright/test';
  11 | 
  12 | export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost';
  13 | 
  14 | export function uniqueUser(prefix = 'e2e') {
  15 |   const ts = Date.now().toString(36);
  16 |   return {
  17 |     email: `${prefix}_${ts}@e2e.test`,
  18 |     username: `${prefix}_${ts}`,
  19 |     password: 'E2eP@ssw0rd!',
  20 |   };
  21 | }
  22 | 
  23 | export async function loginViaUI(page: Page, identifier: string, password: string) {
  24 |   await page.goto('/login');
  25 |   await page.getByLabel(/email or username/i).fill(identifier);
  26 |   await page.getByLabel(/^password/i).fill(password);
  27 |   await page.getByRole('button', { name: /log in/i }).click();
  28 |   // Wait for redirect away from login
  29 |   await expect(page).not.toHaveURL(/\/login/);
  30 | }
  31 | 
  32 | export async function registerViaUI(
  33 |   page: Page,
  34 |   email: string,
  35 |   username: string,
  36 |   password: string,
  37 | ) {
  38 |   await page.goto('/register');
> 39 |   await page.getByLabel(/email/i).fill(email);
     |                                   ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  40 |   await page.getByLabel(/username/i).fill(username);
  41 |   await page.getByLabel(/^password/i).fill(password);
  42 |   const confirmInput = page.getByLabel(/confirm password/i);
  43 |   if (await confirmInput.isVisible()) await confirmInput.fill(password);
  44 |   await page.getByRole('button', { name: /register|sign up|create account/i }).click();
  45 |   await expect(page).not.toHaveURL(/\/register/);
  46 | }
  47 | 
  48 | export async function loginViaAPI(
  49 |   request: APIRequestContext,
  50 |   identifier: string,
  51 |   password: string,
  52 | ): Promise<string> {
  53 |   const res = await request.post(`${BASE}/api/auth/login`, {
  54 |     data: { identifier, password },
  55 |   });
  56 |   if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  57 |   const cookies = res.headers()['set-cookie'] ?? '';
  58 |   const match = cookies.match(/token=([^;]+)/);
  59 |   if (!match) throw new Error('No token cookie in login response');
  60 |   return match[1]!;
  61 | }
  62 | 
  63 | export async function getAdminCredentials() {
  64 |   const email = process.env.E2E_ADMIN_EMAIL;
  65 |   const password = process.env.E2E_ADMIN_PASSWORD;
  66 |   if (!email || !password) {
  67 |     throw new Error(
  68 |       'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set to run admin E2E tests',
  69 |     );
  70 |   }
  71 |   return { email, password };
  72 | }
  73 | 
```