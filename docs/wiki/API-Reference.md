# API Reference

The interactive API reference is built into every Planly instance and served at:

```
https://your-domain.com/api/docs
```

It requires you to be logged in. Once open, paste a Personal Access Token or App Registration token into the auth field at the top and fire requests directly from the browser.

To create a token: click your avatar (top-right) → **Integrations** → **Access Tokens** tab → **Generate**.

For token scopes and App Registrations see [Access Tokens](Access-Tokens.md).

> **Note:** if a request is scoped to a project (via a project-scoped PAT or App Registration token) and that project is marked `completed` or `archived`, the token no longer exists - it was permanently revoked the moment the project's status changed, not merely blocked. Requests made with it fail authentication entirely rather than getting a write-access error. See [Access Tokens → Project scoping](Access-Tokens.md#project-scoping).

---

## Other notable endpoints

Not exhaustive - the full, current list of routes and request/response shapes is always in the interactive docs at `/api/docs`. A few capabilities worth knowing about that aren't covered elsewhere in this wiki:

| Endpoint | Description |
|---|---|
| `GET /api/search?q=...` | Cross-project full-text search over task names/descriptions and messages, scoped to projects you're a member of. Minimum 2-character query, results capped at `limit` (default 20, max 50). Rate-limited to 30 requests/minute. Powers the `⌘K` search box in the top bar. |
| `GET/POST /api/products/:productId/canvas-snapshots` | Save and restore named snapshots of the Canvas view - task node positions plus the pan/zoom/filter state active when the snapshot was taken (up to 5000 positioned nodes per snapshot). |
| `GET/PUT /api/products/:productId/color-legend` | The per-project color-to-label mapping used to categorize tasks (e.g. "Bug", "Feature") across Kanban and other views. Any member can read it; only co-owners can change it. Edited via the legend button on the Canvas view. |

See also [GDPR data export](Security.md#personal-data-export-gdpr) (`GET /api/me/export`) and [project data export](Operations.md#backup-and-restore) (`GET /api/products/:productId/export`).
