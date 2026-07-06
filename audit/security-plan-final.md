# Final Security Audit — Fix Plan

Date: 2026-07-06  
All previously reported issues from the first audit have been resolved. This report covers remaining findings from a fresh full audit.

---

## Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | **High** | SSRF via webhook URL (reach internal metadata / internal services) |
| 2 | **High** | IP restriction bypass via X-Forwarded-For spoofing |
| 3 | **Medium** | Team announcements visible to all authenticated users |
| 4 | **Medium** | Attachment URLs not validated — phishing / IP-leak vector |
| 5 | **Medium** | Tab permissions GET readable by any project member |
| 6 | **Medium** | Legacy file deletion IDOR |
| 7 | **Medium** | Seed endpoint bypasses `allowProjectCreation` policy |
| 8 | **Medium** | Targeted team invite accepts any authenticated user |
| 9 | **Medium** | Tab `none` level not enforced at the API for reads |
| 10 | **Low** | No per-user rate limit on file upload |
| 11 | **Low** | JWT not invalidated on logout |

---

## Finding 1 — SSRF via Webhook URL
**Severity: High**  
**Files:** `backend/src/routes/webhooks.ts:38`, `backend/src/utils/webhook-dispatch.ts`

A co-owner registers a webhook pointing to `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>`. Any task/message event triggers a POST there. The response (up to 1000 chars) is stored in `WebhookDelivery.responseBody` and readable by the attacker. On AWS this yields IAM temporary credentials. Any internal HTTP service on port 80 is reachable the same way.

**Fix:**
```ts
// Before upsert in webhooks route, validate the URL resolves to a public IP
import { resolve4 } from 'dns/promises';
import ipRangeCheck from 'ip-range-check'; // or manual RFC-1918 check

const BLOCKED = ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','169.254.0.0/16','127.0.0.0/8','::1/128'];

async function assertPublicUrl(urlStr: string) {
  const u = new URL(urlStr);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https allowed');
  const ips = await resolve4(u.hostname).catch(() => { throw new Error('Cannot resolve host'); });
  for (const ip of ips) {
    if (ipRangeCheck(ip, BLOCKED)) throw new Error('Webhook URL must resolve to a public IP');
  }
}
```
Re-validate on each dispatch in `webhook-dispatch.ts` before calling `fetch`.

---

## Finding 2 — IP Restriction Bypass via X-Forwarded-For Spoofing
**Severity: High**  
**File:** `backend/src/routes/ip-restrictions.ts:32–50`

`getClientIp` trusts the `X-Forwarded-For` header at a configurable depth. With the default `TRUSTED_PROXY_DEPTH=1` and no reverse proxy in front, an attacker sends `X-Forwarded-For: <allowlisted-ip>` and bypasses the allowlist silently.

**Fix:**
```ts
// Change default
const TRUSTED_PROXY_DEPTH = parseInt(process.env.TRUSTED_PROXY_DEPTH ?? '0', 10);
// When depth is 0, always use socket.remoteAddress — ignore the header entirely
if (TRUSTED_PROXY_DEPTH === 0) return req.socket.remoteAddress ?? req.ip;
```
Add a startup log warning: `if (TRUSTED_PROXY_DEPTH > 0) logger.warn('IP restriction trusting %d proxy hop(s) — ensure a reverse proxy is present')`.

---

## Finding 3 — Announcements Leak Across Teams
**Severity: Medium**  
**File:** `backend/src/routes/announcements.ts:38–45`

`GET /api/announcements` returns all announcements regardless of the caller's team memberships. Any user sees every other team's announcements.

**Fix:**
```ts
// In the GET handler, scope to the user's teams
const userTeamIds = await prisma.teamMember.findMany({
  where: { userId: req.user.userId },
  select: { teamId: true },
}).then(rows => rows.map(r => r.teamId));

const announcements = await prisma.announcement.findMany({
  where: {
    OR: [
      { teamId: null },
      { teamId: { in: userTeamIds } },
    ],
  },
  orderBy: { createdAt: 'desc' },
});
```

---

## Finding 4 — Attachment URL Injection (Phishing / IP Leak)
**Severity: Medium**  
**File:** `backend/src/routes/messages.ts:117–127`

The `attachments` array accepts caller-supplied URLs with no validation. Attackers embed external URLs that look like legitimate uploads. Image attachments rendered in chat leak viewers' IPs to the attacker's server.

**Fix:**
```ts
// In the POST /messages handler, after reading req.body
if (attachments) {
  for (const a of attachments) {
    if (!/^\/api\/uploads\/[a-zA-Z0-9._-]+$/.test(a.url)) {
      return reply.status(400).send({ error: 'Invalid attachment URL' });
    }
  }
}
```

---

## Finding 5 — Tab Permissions Readable by Any Member
**Severity: Medium**  
**File:** `backend/src/routes/permissions.ts:38–43`

`GET /api/products/:productId/permissions` uses `requireProductMember`, so any member — including those with `read`-only access — can read the full permission matrix for all team members.

**Fix:** Change the guard on line 40 from `requireProductMember` to a co-owner check:
```ts
const product = await prisma.product.findUnique({ where: { id: productId }, include: { team: { include: { members: true } } } });
const myRole = product?.team.members.find(m => m.userId === req.user.userId)?.role;
const isOwner = product?.ownerId === req.user.userId;
if (!isOwner && myRole !== 'co_owner') return reply.status(403).send({ error: 'Forbidden' });
```

---

## Finding 6 — Legacy File Deletion IDOR
**Severity: Medium**  
**File:** `backend/src/routes/messages.ts:80–97`

`DELETE /api/uploads/:filename` deletes files with no DB record (so-called "legacy" files) for any authenticated user. Because DB record creation uses `.catch(() => {})`, transient DB errors produce untracked files from normal uploads that any user can then delete.

**Fix:**
1. Remove the legacy path — if no `FileUpload` record exists, return 403.
2. Make record creation mandatory: remove the `.catch(() => {})` on line 48 and let the upload fail hard if the DB write fails.

```ts
// DELETE handler — replace the legacy-fallback block
if (!record) return reply.status(403).send({ error: 'Forbidden' });
if (record.uploaderId !== req.user.userId) return reply.status(403).send({ error: 'Forbidden' });
```

---

## Finding 7 — Seed Endpoint Bypasses `allowProjectCreation`
**Severity: Medium**  
**File:** `backend/src/routes/seed.ts:10`

`POST /api/seed-examples` creates two projects regardless of the `allowProjectCreation` server config flag. Regular users can use it to create projects even when the admin has disabled that capability.

**Fix:** Add at the top of the handler:
```ts
const cfg = await getServerConfig();
if (!cfg.allowProjectCreation && !req.user.isAdmin) {
  return reply.status(403).send({ error: 'Project creation is disabled' });
}
```

---

## Finding 8 — Targeted Invite Accepts Any Authenticated User
**Severity: Medium**  
**File:** `backend/src/routes/invites.ts:99–118`

When an invite is created with a specific target email, `POST /api/invites/:token/accept` does not verify that the accepting user's email matches `invite.email`. Anyone with the link can accept it.

**Fix:**
```ts
if (invite.email && invite.email.toLowerCase() !== req.user.email.toLowerCase()) {
  return reply.status(403).send({ error: 'This invite was sent to a different email address' });
}
```

---

## Finding 9 — Tab `none` Level Not Enforced for API Reads
**Severity: Medium**  
**Files:** `backend/src/utils/product-guard.ts`, all read routes

The `none` permission level hides tabs in the frontend but does not restrict GET requests via the API. A user with `kanban: none` can still call `GET /api/products/:id/tasks` and receive all data.

**Decision required:** Either:
- **Option A (simple):** Rename `none` to something that communicates it's frontend-only ("hidden"), and document it as UI-only. No code changes needed beyond the label.
- **Option B (full enforcement):** Add a `requireTabRead(tab)` guard to all relevant GET routes that returns 403 when the user has `level: 'none'` for that tab. This is the correct approach if the feature is used for security, not just UX.

Recommended: **Option B** if any team uses this for actual access control. **Option A** if it's purely cosmetic.

---

## Finding 10 — No Per-User Rate Limit on File Upload
**Severity: Low**  
**File:** `backend/src/routes/messages.ts:25`

Only the global 200 req/min limiter applies to `POST /api/upload`. A user can upload 10 GB/min (at 50 MB/upload × 200 reqs) before hitting the global ceiling.

**Fix:**
```ts
app.post('/api/upload', {
  preHandler: requireAuth,
  config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
}, async (req, reply) => { ... });
```

---

## Finding 11 — JWT Remains Valid After Logout
**Severity: Low**  
**File:** `backend/src/routes/auth.ts:76–78`

The logout handler clears the cookie but does not increment `tokenVersion`. A captured JWT stays valid for its full 7-day lifetime after the user logs out. Password changes correctly invalidate sessions (they increment `tokenVersion`); logout does not.

**Fix:**
```ts
// In the logout handler, after clearing the cookie:
await prisma.user.update({
  where: { id: req.user.userId },
  data: { tokenVersion: { increment: 1 } },
});
```

---

## What Was Checked and Found Clean

- **SQL injection** — All queries use Prisma ORM parameterization. The one raw CTE (dependency cycle detection) uses tagged-template params correctly.
- **Stored XSS** — ReactMarkdown does not enable `rehype-raw`; HTML in messages is escaped. `javascript:` links blocked by React's sanitizer.
- **Admin privilege escalation** — `requireAdmin` consistently applied; founding-admin checks are layered correctly.
- **IDOR on tasks/messages** — Cross-product lookups always include `productId` in the Prisma where clause and check membership first.
- **Password hashing** — bcrypt cost 12 throughout.
- **API token storage** — SHA-256 hashes only; raw tokens never persisted.
- **CSRF** — Origin-header check plus `SameSite=lax` cookie provides layered protection.
- **File upload MIME spoofing** — Magic-bytes verification applied to all binary types.
- **iCal token revocation** — Generating a new token revokes the previous one for that user+product.
- **ReDoS** — No unbounded user-controlled regex patterns found.
