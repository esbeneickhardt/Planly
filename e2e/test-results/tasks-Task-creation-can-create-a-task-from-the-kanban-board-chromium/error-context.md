# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tasks.spec.ts >> Task creation >> can create a task from the kanban board
- Location: specs/tasks.spec.ts:21:7

# Error details

```
Test timeout of 30000ms exceeded.
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