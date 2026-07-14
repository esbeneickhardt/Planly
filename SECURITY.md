# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Planly, please report it by emailing **security@planly.app** (or the admin contact listed in your deployment). Do **not** open a public GitHub issue for security vulnerabilities.

We aim to acknowledge reports within 48 hours and to issue a fix or mitigation within 14 days for critical issues.

---

## RBAC Hierarchy

Planly uses a four-level role hierarchy per product:

| Role | Who | What they can do |
|------|-----|-----------------|
| `founding_admin` | The user who bootstrapped the server | Everything, including server-wide admin actions and product management |
| `admin` | Server administrators | Everything within the server; manage users, products, settings |
| `co_owner` | Per-product co-owner | Full CRUD on all product data; manage members; configure integrations |
| `member` | Per-product member | Create/edit tasks and messages within their granted tab permissions |

Roles are enforced in middleware (`requireAuth`) and per-route guard checks before any database mutation.

### Membership and Invitation

- Users join a product via invite link (owner/co-owner issues the invite).
- An unauthenticated user with a valid invite token can accept the invite after registering or logging in.
- Membership role defaults to `member`; co-owner can upgrade to `co_owner`.

---

## Tab-Level Permission Matrix

Each product member has a per-tab permission level (`write`, `read`, or `none`):

| Tab | Default (member) | co_owner | Description |
|-----|-----------------|----------|-------------|
| kanban | write | write | Kanban board task management |
| backlog | write | write | Backlog list and sprint planning |
| gantt | read | write | Gantt chart timeline view |
| canvas | write | write | Freeform canvas / mind-map |
| messages | write | write | Real-time team messaging |
| analytics | read | write | Product analytics and charts |
| settings | none | write | Product settings (members, webhooks, etc.) |

`none` means the tab is not visible to the user. co_owners and admins always have full access.

---

## Field-Level Access Policy

### Tasks

- **Title, status, description, deadline:** Any member with `write` on the relevant tab.
- **Owner, reviewer assignment:** Any `write` member; admins and co-owners.
- **Delete (soft):** Task creator, assigned owner, co-owner, or admin.
- **Hard delete:** co-owner or admin only (via admin panel).

### Messages

- **Create:** Any member with `write` on messages.
- **Edit:** Author only (within the product they posted in).
- **Delete:** Author or co-owner/admin.
- **Attachments:** File uploads are validated for MIME type match; max 50 MB per file.

### User PII (`realName`, `phone`)

- Stored AES-256-GCM encrypted at rest.
- Returned in plaintext only to: the user themselves (own profile), admins (admin panel).
- Team member search returns only `id`, `username`, `avatarEmoji` - no PII.

---

## Session & Token Security

- Sessions use httpOnly, SameSite=Lax cookies (JWT, 7-day expiry).
- `tokenVersion` claim in the JWT; incremented on every login - prior sessions are immediately invalidated.
- `GET /api/auth/refresh` re-issues the session cookie (sliding expiry).
- WebSocket connections use short-lived single-use tickets (`POST /api/products/:id/ws-ticket`, 30s TTL) - no JWT in query params.
- API tokens: stored as SHA-256 hashes; raw token shown only once at creation.

---

## Accepted Risks

| Risk | Rationale | Mitigation |
|------|-----------|------------|
| SSRF via webhook URLs | Webhooks can be configured to any URL. Only product owners and co-owners can create or update webhooks. Trusted actors at that level are considered authorised to make outbound HTTP calls. | Webhook URLs validated as `https://` at creation. Internal IP ranges are not blocked (owner-level trust accepted). |
| No TOTP MFA yet | Planned feature. | Strong password policy (bcrypt 12 rounds), account lockout after 10 failed attempts, `tokenVersion` session revocation on login. |
| No nonce-based CSP | Tailwind JIT requires `'unsafe-inline'` for style-src; eliminating it requires a full build pipeline change. | `script-src` does not include `'unsafe-inline'`. CSP is reviewed at each Nginx config change. |
| Docker image signing (cosign) | Container registry is private; access is strictly controlled via deploy keys. | Images are scanned by Trivy in CI (HIGH/CRITICAL, fail-fast). Dependabot keeps base image digests current. |

---

*Last updated: 2026-07-06*
