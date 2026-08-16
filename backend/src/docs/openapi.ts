/**
 * API reference routes - serves a self-contained HTML page documenting every endpoint.
 *
 * The page is a static template with inline CSS/JS; PLANLY_ORIGIN is replaced with the
 * configured frontend origin at request time. Requires authentication to view.
 */
import { FastifyInstance } from 'fastify';
import { config } from '../config/env';
import { requireAuth } from '../middleware/auth';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Planly API Reference</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; line-height: 1.6; }
  .layout { display: flex; min-height: 100vh; }
  nav { width: 240px; flex-shrink: 0; background: #1a1d27; border-right: 1px solid #2a2d3e; padding: 28px 0; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  nav h1 { font-size: 16px; font-weight: 700; color: #a78bfa; padding: 0 20px 20px; border-bottom: 1px solid #2a2d3e; margin-bottom: 12px; }
  nav a { display: block; padding: 6px 20px; font-size: 13px; color: #94a3b8; text-decoration: none; transition: color .15s, background .15s; }
  nav a:hover { color: #e2e8f0; background: #252836; }
  nav .section { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #4a5568; padding: 14px 20px 4px; }
  main { flex: 1; padding: 40px 48px; max-width: 960px; }
  h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #f1f5f9; }
  h3 { font-size: 15px; font-weight: 600; margin: 32px 0 8px; color: #e2e8f0; }
  p, li { font-size: 14px; color: #94a3b8; margin-bottom: 8px; }
  ul { padding-left: 20px; }
  code { font-family: "Fira Code", "Cascadia Code", monospace; font-size: 13px; }
  .endpoint { margin-bottom: 16px; border: 1px solid #2a2d3e; border-radius: 10px; overflow: hidden; }
  .endpoint-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #1a1d27; cursor: pointer; user-select: none; }
  .endpoint-header:hover { background: #1e2130; }
  .method { font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 5px; letter-spacing: .04em; flex-shrink: 0; }
  .GET    { background: rgba(16,185,129,.15); color: #10b981; }
  .POST   { background: rgba(99,102,241,.15);  color: #818cf8; }
  .PATCH  { background: rgba(245,158,11,.15);  color: #f59e0b; }
  .PUT    { background: rgba(59,130,246,.15);  color: #60a5fa; }
  .DELETE { background: rgba(239,68,68,.15);   color: #f87171; }
  .path { font-family: monospace; font-size: 13px; color: #e2e8f0; flex: 1; }
  .endpoint-desc { padding: 10px 14px; font-size: 13px; color: #94a3b8; background: #0f1117; border-top: 1px solid #2a2d3e; }
  .auth-box { background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 10px; padding: 16px 20px; margin-bottom: 28px; }
  .auth-box code { background: #252836; padding: 2px 6px; border-radius: 4px; color: #a78bfa; }
  pre { background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-size: 12px; color: #94a3b8; margin: 8px 0 0; white-space: pre-wrap; word-break: break-all; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 20px; background: rgba(167,139,250,.12); color: #a78bfa; border: 1px solid rgba(167,139,250,.25); margin-bottom: 24px; }
  hr { border: none; border-top: 1px solid #2a2d3e; margin: 32px 0; }

  /* ── Role badges ── */
  .role { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; letter-spacing: .04em; margin-right: 4px; vertical-align: middle; flex-shrink: 0; }
  .role-superadmin { background: rgba(239,68,68,.2);   color: #fca5a5; border: 1px solid rgba(239,68,68,.3); }
  .role-admin      { background: rgba(239,68,68,.12);  color: #f87171; border: 1px solid rgba(239,68,68,.2); }
  .role-owner      { background: rgba(245,158,11,.18); color: #fbbf24; border: 1px solid rgba(245,158,11,.3); }
  .role-coowner    { background: rgba(245,158,11,.1);  color: #f59e0b; border: 1px solid rgba(245,158,11,.2); }
  .role-writer     { background: rgba(99,102,241,.15); color: #818cf8; border: 1px solid rgba(99,102,241,.25); }
  .role-reader     { background: rgba(16,185,129,.12); color: #34d399; border: 1px solid rgba(16,185,129,.2); }
  .role-any        { background: rgba(148,163,184,.1); color: #94a3b8; border: 1px solid rgba(148,163,184,.2); }

  /* ── RBAC overview table ── */
  .rbac-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  .rbac-table th { text-align: left; padding: 8px 12px; background: #1a1d27; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; border-bottom: 1px solid #2a2d3e; }
  .rbac-table td { padding: 8px 12px; border-bottom: 1px solid #1e2130; color: #94a3b8; vertical-align: top; line-height: 1.5; }
  .rbac-table tr:last-child td { border-bottom: none; }
  .rbac-table tr:hover td { background: #131620; }

  /* ── Token bar ── */
  .token-bar { display: flex; align-items: center; gap: 10px; background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 10px; padding: 10px 14px; margin-bottom: 28px; }
  .token-bar label { font-size: 12px; font-weight: 600; color: #a78bfa; white-space: nowrap; flex-shrink: 0; }
  .token-bar input { flex: 1; background: #252836; border: 1px solid #2a2d3e; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #e2e8f0; font-family: monospace; outline: none; }
  .token-bar input:focus { border-color: #a78bfa; }
  .token-bar .tok-status { font-size: 11px; white-space: nowrap; flex-shrink: 0; }

  /* ── Try-it button ── */
  .try-btn { margin-left: auto; flex-shrink: 0; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 6px; border: 1px solid #2a2d3e; background: #252836; color: #a78bfa; cursor: pointer; transition: background .15s, border-color .15s; white-space: nowrap; }
  .try-btn:hover { background: rgba(167,139,250,.15); border-color: #a78bfa; }
  .try-btn.open { background: rgba(167,139,250,.15); border-color: #a78bfa; color: #c4b5fd; }

  /* ── Try-it panel ── */
  .try-panel { background: #0b0d14; border-top: 1px solid #2a2d3e; padding: 16px; display: none; }
  .try-panel.visible { display: block; }
  .try-section { margin-bottom: 14px; }
  .try-section-label { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #4a5568; margin-bottom: 8px; }
  .param-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .param-row label { font-size: 12px; font-family: monospace; color: #a78bfa; width: 130px; flex-shrink: 0; }
  .param-row input { flex: 1; background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 6px; padding: 5px 9px; font-size: 12px; font-family: monospace; color: #e2e8f0; outline: none; }
  .param-row input:focus { border-color: #a78bfa; }
  .body-editor { width: 100%; background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 6px; padding: 10px 12px; font-size: 12px; font-family: monospace; color: #e2e8f0; resize: vertical; outline: none; line-height: 1.5; }
  .body-editor:focus { border-color: #a78bfa; }
  .try-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
  .send-btn { font-size: 12px; font-weight: 600; padding: 6px 16px; border-radius: 6px; border: none; background: #a78bfa; color: #0f1117; cursor: pointer; transition: opacity .15s; }
  .send-btn:hover { opacity: .85; }
  .send-btn:disabled { opacity: .4; cursor: default; }
  .copy-btn { font-size: 11px; padding: 5px 10px; border-radius: 6px; border: 1px solid #2a2d3e; background: transparent; color: #94a3b8; cursor: pointer; }
  .copy-btn:hover { color: #e2e8f0; }

  /* ── Response ── */
  .response-box { margin-top: 14px; border-radius: 8px; overflow: hidden; border: 1px solid #2a2d3e; display: none; }
  .response-status { font-size: 12px; font-weight: 700; padding: 6px 12px; font-family: monospace; }
  .response-body { margin: 0; border-radius: 0; border: none; border-top: 1px solid #2a2d3e; max-height: 360px; overflow-y: auto; }
</style>
</head>
<body>
<div class="layout">
<nav>
  <a href="/" style="display:flex;align-items:center;gap:6px;margin:0 12px 16px;padding:7px 10px;font-size:12px;font-weight:600;color:#a78bfa;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);border-radius:8px;text-decoration:none;transition:background .15s;" onmouseover="this.style.background='rgba(167,139,250,.16)'" onmouseout="this.style.background='rgba(167,139,250,.08)'">← Back to Planly</a>
  <h1>Planly API</h1>

  <div class="section">Getting Started</div>
  <a href="#auth">Authentication</a>
  <a href="#roles">RBAC Roles</a>

  <div class="section">Account</div>
  <a href="#me">Current User</a>
  <a href="#tokens">API Tokens</a>
  <a href="#notifications">Notifications</a>

  <div class="section">Teams</div>
  <a href="#teams">Teams &amp; Members</a>
  <a href="#invites">Invites</a>

  <div class="section">Projects</div>
  <a href="#products">Projects</a>
  <a href="#access-requests">Access Requests</a>
  <a href="#permissions">Tab Permissions</a>
  <a href="#labels">Color Labels</a>
  <a href="#analytics">Analytics</a>
  <a href="#webhooks">Webhooks</a>
  <a href="#apps">App Registrations</a>
  <a href="#export">Export</a>

  <div class="section">Project Content</div>
  <a href="#tasks">Tasks</a>
  <a href="#connections">Task Connections</a>
  <a href="#milestones">Milestones</a>
  <a href="#sprints">Sprints</a>
  <a href="#canvas">Canvas</a>
  <a href="#messages">Messages</a>
  <a href="#activity">Activity</a>

  <div class="section">Server-wide</div>
  <a href="#announcements">Announcements</a>
  <a href="#search">Search</a>

  <div class="section">Admin</div>
  <a href="#admin-users">Users</a>
  <a href="#admin-config">Server Config</a>
  <a href="#admin-whitelist">Email Whitelist</a>
  <a href="#admin-stats">Statistics</a>
  <a href="#admin-logs">Audit Logs</a>
</nav>
<main>
  <h2>Planly API Reference</h2>
  <span class="badge">REST · JSON · Bearer Auth</span>

  <!-- Token bar -->
  <div class="token-bar">
    <label>🔑 Bearer token</label>
    <input id="token-input" type="text" placeholder="planly_…  (paste your token here to try endpoints)" spellcheck="false" autocomplete="off" />
    <span class="tok-status" id="tok-status"></span>
  </div>

  <!-- ── Authentication ──────────────────────────────────────────────── -->
  <div class="auth-box" id="auth">
    <h3 style="margin-top:0">Base URL</h3>
    <p>All endpoints are relative to: <code>PLANLY_ORIGIN</code></p>
    <h3>Authentication</h3>
    <p>Generate a token under <strong>Settings → Apps</strong> or <strong>Account → Integrations</strong>, then include it in every request:</p>
    <pre>Authorization: Bearer &lt;YOUR_TOKEN&gt;</pre>
    <p style="margin-top:8px">Tokens also work as a query parameter: <code>?token=&lt;YOUR_TOKEN&gt;</code></p>
  </div>

  <!-- ── RBAC Roles ──────────────────────────────────────────────────── -->
  <hr id="roles" />
  <h2>RBAC Roles</h2>
  <p>Planly uses a layered role system. Server-level roles apply globally; project-level roles apply per project.</p>

  <h3>Server-level roles</h3>
  <table class="rbac-table">
    <tr><th>Role</th><th>Badge</th><th>Description</th></tr>
    <tr>
      <td><strong>SuperAdmin</strong> (Founding Admin)</td>
      <td><span class="role role-superadmin">SUPERADMIN</span></td>
      <td>The first admin who set up the server. Can do everything Admins can, plus: transfer the founding-admin crown, demote other admins, delete user accounts, and prune audit logs. There is always exactly one SuperAdmin.</td>
    </tr>
    <tr>
      <td><strong>Admin</strong></td>
      <td><span class="role role-admin">ADMIN</span></td>
      <td>Server administrator. Can manage users (promote, unlock, verify), configure server settings, manage the email whitelist, view all projects and audit logs. Cannot demote other admins or alter the SuperAdmin.</td>
    </tr>
    <tr>
      <td><strong>Authenticated User</strong></td>
      <td><span class="role role-any">AUTH</span></td>
      <td>Any logged-in user. Can create projects (if permitted by server config), manage their own account, and request access to projects.</td>
    </tr>
  </table>

  <h3>Project-level roles</h3>
  <table class="rbac-table">
    <tr><th>Role</th><th>Badge</th><th>Description</th></tr>
    <tr>
      <td><strong>Owner</strong></td>
      <td><span class="role role-owner">OWNER</span></td>
      <td>Full control over the project: edit details, manage members and their roles, configure analytics/webhooks/labels/app registrations, transfer ownership, delete the project.</td>
    </tr>
    <tr>
      <td><strong>Co-owner</strong></td>
      <td><span class="role role-coowner">CO-OWNER</span></td>
      <td>Same rights as Owner except: cannot remove or demote the Owner, and cannot delete the project.</td>
    </tr>
    <tr>
      <td><strong>Member (Writer)</strong></td>
      <td><span class="role role-writer">WRITER</span></td>
      <td>Can create, edit, and delete tasks; manage sprints; edit the canvas; post messages. Write access is granted per tab (kanban, backlog, gantt, canvas).</td>
    </tr>
    <tr>
      <td><strong>Member (Reader)</strong></td>
      <td><span class="role role-reader">READER</span></td>
      <td>Read-only access to project content. Can view tasks, milestones, sprints, and the canvas. Cannot create or modify anything.</td>
    </tr>
  </table>

  <h3>Announcement posting roles</h3>
  <p>Server admins can configure who is allowed to post announcements via <code>announcementPostRole</code> in server config: <code>admin</code> (admin only), <code>admin_and_owners</code> (admins + project owners), or <code>all</code> (all authenticated users). Only server admins may pin announcements.</p>

  <!-- ── Current User ─────────────────────────────────────────────────── -->
  <hr id="me" />
  <h2>Current User</h2>

  <div class="endpoint" data-method="GET" data-path="/api/auth/me">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/auth/me</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Returns the authenticated user's profile, including <code>isAdmin</code> and <code>isFoundingAdmin</code>.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/me/permissions">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/me/permissions</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Returns all projects the user belongs to with their role and per-tab permission levels.
<pre>[
  {
    "productId": "...",
    "productName": "My Project",
    "productEmoji": "🚀",
    "role": "owner | co_owner | member",
    "permissions": {
      "kanban": "write | read | none",
      "backlog": "write | read | none",
      "gantt": "write | read | none",
      "canvas": "write | read | none"
    }
  }
]</pre>
    </div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/users/:id">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/users/:id</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Get a user's public profile by ID.</div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/users/:id" data-body='{"username":"","avatarEmoji":""}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/users/:id</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Update your own profile. You can only patch your own account.
<pre>{ "username": "string?", "avatarEmoji": "string?", "currentPassword": "string?", "newPassword": "string?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/users/:id">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/users/:id</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Delete your own account. Irreversible. Admins can delete any account via <code>/api/admin/users/:id</code>.</div>
  </div>

  <!-- ── API Tokens ─────────────────────────────────────────────────────── -->
  <hr id="tokens" />
  <h2>API Tokens</h2>
  <p>Personal access tokens are tied to your account. App registration tokens (scoped to a project) are managed under <a href="#apps">App Registrations</a>.</p>

  <div class="endpoint" data-method="GET" data-path="/api/auth/tokens">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/auth/tokens</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List your personal access tokens (raw token value never returned after creation).</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/auth/tokens" data-body='{"name":"My token","expiresAt":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/auth/tokens</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Create a new personal token. The raw token value is returned once - store it securely.
<pre>{ "name": "string", "expiresAt": "ISO8601?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/auth/tokens/:tokenId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/auth/tokens/:tokenId</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Revoke a personal token immediately.</div>
  </div>

  <!-- ── Notifications ──────────────────────────────────────────────────── -->
  <hr id="notifications" />
  <h2>Notifications</h2>

  <div class="endpoint" data-method="GET" data-path="/api/notifications">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/notifications</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List your notifications. Optional query param <code>?unreadOnly=true</code>.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/notifications/unread-count">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/notifications/unread-count</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Returns <code>{ count: number }</code> - useful for badge indicators.</div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/notifications/read" data-body='{"ids":[]}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/notifications/read</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Mark specific notifications as read.
<pre>{ "ids": ["notifId1", "notifId2"] }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/notifications/read-all">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/notifications/read-all</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Mark all your notifications as read.</div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/notifications/:notificationId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/notifications/:notificationId</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Delete a single notification.</div>
  </div>

  <!-- ── Teams ──────────────────────────────────────────────────────────── -->
  <hr id="teams" />
  <h2>Teams &amp; Members</h2>
  <p>Teams are workspace groups that contain projects. A user can belong to multiple teams with different roles. Projects created inside a team are accessible to team members based on their per-project tab permissions.</p>

  <div class="endpoint" data-method="GET" data-path="/api/teams">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/teams</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List all teams the authenticated user belongs to.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/teams" data-body='{"name":"Engineering","emoji":"⚙️"}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/teams</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Create a new team. The creator becomes the team owner.
<pre>{ "name": "string", "emoji": "string?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/teams/:id">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/teams/:id</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Get team details including member list.</div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/teams/:id" data-body='{"name":"","emoji":""}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/teams/:id</span></div>
    <div class="endpoint-desc"><span class="role role-owner">OWNER</span> Update team name or emoji. Owner or co-owner only.
<pre>{ "name": "string?", "emoji": "string?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/teams/:id">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/teams/:id</span></div>
    <div class="endpoint-desc"><span class="role role-owner">OWNER</span> Delete the team and all its projects. Owner only.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/teams/:id/members" data-body='{"userId":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/teams/:id/members</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Add a user to the team. Owner or co-owner only.
<pre>{ "userId": "string" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/teams/:id/members/:userId/role" data-body='{"role":"co_owner"}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/teams/:id/members/:userId/role</span></div>
    <div class="endpoint-desc"><span class="role role-owner">OWNER</span> Change a member's team role. Owner only. Valid roles: <code>co_owner</code>, <code>member</code>. A co-owner cannot change the owner's role.
<pre>{ "role": "co_owner | member" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/teams/:id/members/:userId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/teams/:id/members/:userId</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Remove a member from the team. Owner and co-owner can remove members. Only the owner can remove a co-owner. A co-owner cannot remove the owner.</div>
  </div>

  <!-- ── Invites ─────────────────────────────────────────────────────────── -->
  <hr id="invites" />
  <h2>Invites</h2>
  <p>Invite links allow adding users to a team without knowing their user ID in advance. Each invite has an expiry and can be revoked.</p>

  <div class="endpoint" data-method="GET" data-path="/api/teams/:teamId/invites">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/teams/:teamId/invites</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> List active invite links for the team.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/teams/:teamId/invites" data-body='{"expiresInDays":7}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/teams/:teamId/invites</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Create a new invite link. Returns a one-time token to be shared.
<pre>{ "expiresInDays": 7 }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/teams/:teamId/invites/:inviteId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/teams/:teamId/invites/:inviteId</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Revoke an invite link immediately.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/invites/:token">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/invites/:token</span></div>
    <div class="endpoint-desc"><em>Public</em> - Look up an invite by token to display team name and expiry before accepting.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/invites/:token/accept">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/invites/:token/accept</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Accept an invite and join the team.</div>
  </div>

  <!-- ── Projects ───────────────────────────────────────────────────────── -->
  <hr id="products" />
  <h2>Projects</h2>
  <p>Projects (called <em>products</em> in the API) live inside teams. Each project has an owner, optional co-owners, and members with per-tab permissions.</p>

  <div class="endpoint" data-method="GET" data-path="/api/products">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List all projects the authenticated user is a member of.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/products/discover">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/discover</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List all projects the user is <em>not</em> yet a member of. Used to find projects to request access to.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/products/:id">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> Get a single project by ID.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products" data-body='{"name":"My Project","emoji":"rocket","description":"","deadline":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Create a new project. The creator becomes the owner. Requires <code>allowProjectCreation</code> to be enabled in server config (or the user is an admin).
<pre>{ "name": "string", "emoji": "string?", "description": "string?", "deadline": "ISO8601?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/products/:id" data-body='{"name":"","emoji":"","description":"","deadline":"","analyticsEnabled":true}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Update project details. Pass <code>ownerId</code> to transfer ownership (owner only). Pass <code>analyticsEnabled</code> to toggle analytics visibility (owner only).
<pre>{
  "name": "string?",
  "emoji": "string?",
  "description": "string?",
  "deadline": "ISO8601?",
  "ownerId": "userId? (transfer ownership, owner only)",
  "analyticsEnabled": "boolean? (owner only)"
}</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/products/:id">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc"><span class="role role-owner">OWNER</span> Delete a project and all its data. Owner only. Irreversible.</div>
  </div>

  <!-- ── Access Requests ────────────────────────────────────────────────── -->
  <hr id="access-requests" />
  <h2>Access Requests</h2>
  <p>Users can request access to projects they are not yet members of. Project owners/co-owners approve or reject requests.</p>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/access-requests" data-body='{"message":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/access-requests</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Request access to a project. Optional message to the owner.
<pre>{ "message": "string?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/access-requests">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/access-requests</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> List pending access requests for a project.</div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/products/:productId/access-requests/:requestId" data-body='{"status":"approved"}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/access-requests/:requestId</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Approve or reject an access request.
<pre>{ "status": "approved | rejected" }</pre>
    </div>
  </div>

  <!-- ── Tab Permissions ────────────────────────────────────────────────── -->
  <hr id="permissions" />
  <h2>Tab Permissions</h2>
  <p>Each project member has per-tab access levels: <code>write</code>, <code>read</code>, or <code>none</code>. Tabs are <code>kanban</code>, <code>backlog</code>, <code>gantt</code>, and <code>canvas</code>.</p>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/permissions">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/permissions</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Get all member permissions for a project.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/products/:productId/permissions" data-body='[{"userId":"","tab":"kanban","level":"read"}]'>
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/products/:productId/permissions</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Set permissions for one or more members. Replaces existing entries for the given user+tab pairs.
<pre>[{ "userId": "string", "tab": "kanban|backlog|gantt|canvas", "level": "read|write|none" }]</pre>
    </div>
  </div>

  <!-- ── Color Labels ───────────────────────────────────────────────────── -->
  <hr id="labels" />
  <h2>Color Labels</h2>
  <p>Projects have a configurable set of color labels that can be applied to tasks. Owners/co-owners define the palette; all members can read it.</p>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/color-legend">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/color-legend</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> Get the color label palette for a project. Returns an array of label objects.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/products/:productId/color-legend" data-body='[{"id":"","label":"Bug","color":"#ef4444","active":true}]'>
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/products/:productId/color-legend</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Replace the entire color label palette. Each entry can be activated or deactivated.
<pre>[{ "id": "string?", "label": "string", "color": "#hex", "active": true }]</pre>
    </div>
  </div>

  <!-- ── Analytics ──────────────────────────────────────────────────────── -->
  <hr id="analytics" />
  <h2>Analytics</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/analytics">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/analytics</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> Returns task velocity, cycle times, status breakdown, and sprint velocity for the last 90 days. If analytics is disabled, only the owner and co-owners can access this.
<pre>{
  "tasksByDay": [{ "date": "YYYY-MM-DD", "count": 5 }],
  "cycleTimeAvgDays": 3.2,
  "totalCompleted": 142,
  "totalActive": 18,
  "statusBreakdown": [{ "status": "In Progress", "count": 10 }],
  "sprintVelocity": [{ "sprintId": "...", "name": "Sprint 1", "completed": 12 }]
}</pre>
    </div>
  </div>

  <!-- ── Webhooks ───────────────────────────────────────────────────────── -->
  <hr id="webhooks" />
  <h2>Webhooks</h2>
  <p>Receive HTTP POST callbacks when events occur in a project. Planly signs each delivery with an HMAC-SHA256 signature in the <code>X-Planly-Signature</code> header using the webhook secret.</p>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/webhooks">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/webhooks</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> List webhooks for a project.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/webhooks" data-body='{"url":"https://example.com/hook","events":["task.created","task.updated"]}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/webhooks</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Create a webhook. The secret is returned once - store it to verify signatures.
<pre>{
  "url": "string",
  "events": ["task.created", "task.updated", "task.deleted", "sprint.created", "sprint.updated"]
}</pre>
    </div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/products/:productId/webhooks/:webhookId" data-body='{"url":"","events":[],"active":true}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/webhooks/:webhookId</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Update webhook URL, events, or active state.
<pre>{ "url": "string?", "events": "string[]?", "active": "boolean?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/webhooks/:webhookId/rotate-secret">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/webhooks/:webhookId/rotate-secret</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Rotate the webhook secret. Returns the new secret once - update your receiver immediately.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/webhooks/:webhookId/deliveries">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/webhooks/:webhookId/deliveries</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> List recent webhook deliveries with status codes and response bodies for debugging.</div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/products/:productId/webhooks/:webhookId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/webhooks/:webhookId</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Delete a webhook.</div>
  </div>

  <!-- ── App Registrations ──────────────────────────────────────────────── -->
  <hr id="apps" />
  <h2>App Registrations</h2>
  <p>App registrations let you create named integrations with their own token sets - useful for CI pipelines, bots, and external tools. App tokens act as personal tokens on behalf of the registering user.</p>

  <div class="endpoint" data-method="GET" data-path="/api/apps">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/apps</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List your app registrations.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/apps" data-body='{"name":"My Integration","description":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/apps</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Create a new app registration.
<pre>{ "name": "string", "description": "string?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/apps/:appId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/apps/:appId</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Delete an app registration and all its tokens. Own apps only.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/apps/:appId/tokens">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/apps/:appId/tokens</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List tokens for an app registration.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/apps/:appId/tokens" data-body='{"name":"ci-token","expiresAt":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/apps/:appId/tokens</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Create a token for an app. Raw token shown once in response.
<pre>{ "name": "string", "expiresAt": "ISO8601?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/apps/:appId/tokens/:tokenId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/apps/:appId/tokens/:tokenId</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Revoke an app token.</div>
  </div>

  <!-- ── Export ─────────────────────────────────────────────────────────── -->
  <hr id="export" />
  <h2>Export</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/export">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/export</span></div>
    <div class="endpoint-desc"><span class="role role-coowner">CO-OWNER</span> Export all project data as JSON (tasks, sprints, milestones, members). Useful for backups or migration.</div>
  </div>

  <!-- ── Tasks ──────────────────────────────────────────────────────────── -->
  <hr id="tasks" />
  <h2>Tasks</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/tasks">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/tasks</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> List all tasks for a project.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/tasks/:taskId">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/tasks/:taskId</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> Get a single task.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/tasks" data-body='{"name":"New task","description":"","deadline":"","ownerId":"","color":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/tasks</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Create a task. Requires write access on the <code>kanban</code> or <code>backlog</code> tab.
<pre>{ "name": "string", "description": "string?", "deadline": "ISO8601?", "ownerId": "userId?", "color": "hex?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/products/:productId/tasks/:taskId" data-body='{"name":"","status":"","ownerId":""}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/tasks/:taskId</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Update a task. Supports <code>name</code>, <code>description</code>, <code>status</code>, <code>deadline</code>, <code>ownerId</code>, <code>color</code>.</div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/products/:productId/tasks/:taskId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/tasks/:taskId</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Delete a task.</div>
  </div>

  <!-- ── Task Connections ───────────────────────────────────────────────── -->
  <hr id="connections" />
  <h2>Task Connections</h2>
  <p>Task connections represent dependencies between tasks (used in the Gantt and Canvas views).</p>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/connections">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/connections</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> Get all task dependency connections for a project.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/connections" data-body='{"fromTaskId":"","toTaskId":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/connections</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Create a dependency: <code>fromTaskId</code> must be completed before <code>toTaskId</code>.
<pre>{ "fromTaskId": "string", "toTaskId": "string" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/products/:productId/connections/:taskId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/connections/:taskId</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Remove a task connection by the connection/task ID.</div>
  </div>

  <!-- ── Milestones ─────────────────────────────────────────────────────── -->
  <hr id="milestones" />
  <h2>Milestones</h2>
  <p>Milestones are tasks that have a deadline. Use the task endpoints to create them; this endpoint provides a summarised view with dependency and progress info.</p>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/milestones">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/milestones</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> List milestones with dependency graph and completion status.</div>
  </div>

  <!-- ── Sprints ─────────────────────────────────────────────────────────── -->
  <hr id="sprints" />
  <h2>Sprints</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/sprints">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/sprints</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> List sprints for a project including tasks in each sprint.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/sprints" data-body='{"name":"Sprint 1","startDate":"2026-07-01","endDate":"2026-07-14"}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/sprints</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Create a sprint.
<pre>{ "name": "string", "startDate": "ISO8601", "endDate": "ISO8601" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/products/:productId/sprints/:sprintId" data-body='{"name":"","startDate":"","endDate":"","taskIds":[]}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/sprints/:sprintId</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Update sprint details. Pass <code>taskIds</code> (array) to set the full list of tasks in this sprint.
<pre>{ "name": "string?", "startDate": "ISO8601?", "endDate": "ISO8601?", "taskIds": "string[]?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/products/:productId/sprints/:sprintId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/sprints/:sprintId</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Delete a sprint. Tasks in the sprint are not deleted.</div>
  </div>

  <!-- ── Canvas ─────────────────────────────────────────────────────────── -->
  <hr id="canvas" />
  <h2>Canvas</h2>
  <p>Canvas snapshots store the visual layout of the project plan. Each snapshot captures positions, connections, and annotations.</p>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/canvas-snapshots">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/canvas-snapshots</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> List saved canvas snapshots for a project.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/canvas-snapshots" data-body='{"name":"Sprint 2 plan","data":{}}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/canvas-snapshots</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Save a canvas snapshot.
<pre>{ "name": "string", "data": "object (canvas state)" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/products/:productId/canvas-snapshots/:snapshotId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/canvas-snapshots/:snapshotId</span></div>
    <div class="endpoint-desc"><span class="role role-writer">WRITER</span> Delete a canvas snapshot.</div>
  </div>

  <!-- ── Messages ───────────────────────────────────────────────────────── -->
  <hr id="messages" />
  <h2>Messages</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/messages">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/messages</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> List messages in the project chat. Optional query param <code>?taskId=</code> to scope to a task thread.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/messages" data-body='{"content":"Hello from the API","taskId":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/messages</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> Post a message. Any project member (including readers) can send messages.
<pre>{ "content": "string", "taskId": "string?" }</pre>
    </div>
  </div>

  <!-- ── Activity ───────────────────────────────────────────────────────── -->
  <hr id="activity" />
  <h2>Activity</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/activity">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/activity</span></div>
    <div class="endpoint-desc"><span class="role role-reader">READER</span> Recent activity log for the project (task changes, membership events, etc.).</div>
  </div>

  <!-- ── Announcements ──────────────────────────────────────────────────── -->
  <hr id="announcements" />
  <h2>Announcements</h2>
  <p>Server-wide or team-scoped announcements. Pinning is restricted to server admins. Announcements posted by a team cannot be pinned. Comments can be disabled per announcement.</p>

  <div class="endpoint" data-method="GET" data-path="/api/announcements">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/announcements</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List all announcements ordered by pinned → newest. Returns <code>canPost</code> and <code>enabled</code> flags so the UI can conditionally show compose controls.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/announcements" data-body='{"title":"Important update","content":"Details here...","pinned":false,"teamId":null,"commentsEnabled":true}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/announcements</span></div>
    <div class="endpoint-desc"><span class="role role-writer">POSTER</span> Create an announcement. Who can post is controlled by <code>announcementPostRole</code> in server config (<code>admin</code>, <code>admin_and_owners</code>, or <code>all</code>). Team announcements cannot be pinned.
<pre>{
  "title": "string",
  "content": "string (Markdown)",
  "pinned": "boolean? (admin only, server-wide only)",
  "teamId": "string? (omit for server-wide)",
  "commentsEnabled": "boolean? (default true)"
}</pre>
    </div>
  </div>

  <div class="endpoint" data-method="PATCH" data-path="/api/announcements/:id" data-body='{"title":"","content":"","pinned":false,"commentsEnabled":true}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/announcements/:id</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN or AUTHOR</span> Edit an announcement. Authors can edit their own; admins can edit any. Cannot pin team announcements.
<pre>{ "title": "string?", "content": "string?", "pinned": "boolean?", "commentsEnabled": "boolean?" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/announcements/:id">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/announcements/:id</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN or AUTHOR</span> Delete an announcement.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/announcements/:id/comments">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/announcements/:id/comments</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> List comments on an announcement.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/announcements/:id/comments" data-body='{"content":"Great update!"}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/announcements/:id/comments</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Post a comment. Returns 403 if comments are disabled on the announcement.
<pre>{ "content": "string" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/announcements/:id/comments/:commentId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/announcements/:id/comments/:commentId</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN or AUTHOR</span> Delete a comment. Authors can delete their own; admins can delete any.</div>
  </div>

  <!-- ── Search ─────────────────────────────────────────────────────────── -->
  <hr id="search" />
  <h2>Search</h2>

  <div class="endpoint" data-method="GET" data-path="/api/search?q=">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/search?q=&lt;query&gt;</span></div>
    <div class="endpoint-desc"><span class="role role-any">AUTH</span> Full-text search across tasks and messages in all projects you have access to. Returns <code>{ tasks, messages }</code>.</div>
  </div>

  <!-- ── Admin: Users ───────────────────────────────────────────────────── -->
  <hr id="admin-users" />
  <h2>Admin · Users</h2>
  <p>All admin endpoints require the <span class="role role-admin">ADMIN</span> role. Endpoints marked <span class="role role-superadmin">SUPERADMIN</span> require the founding-admin crown.</p>

  <div class="endpoint" data-method="GET" data-path="/api/admin/users">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/admin/users</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> List all users with their admin status, email verification, and login-lock state.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/admin/users/:id/promote">
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/admin/users/:id/promote</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Grant server admin role to a user. Action is logged.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/admin/users/:id/demote">
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/admin/users/:id/demote</span></div>
    <div class="endpoint-desc"><span class="role role-superadmin">SUPERADMIN</span> Revoke admin role from a user. Only the founding admin can demote other admins. The founding admin themselves cannot be demoted - use transfer-crown first.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/admin/users/:id/unlock">
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/admin/users/:id/unlock</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Clear a login lockout caused by repeated failed password attempts.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/admin/users/:id/verify-email">
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/admin/users/:id/verify-email</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Force-mark a user's email as verified (bypasses the verification email flow). Action is logged.</div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/admin/users/:id">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/admin/users/:id</span></div>
    <div class="endpoint-desc"><span class="role role-superadmin">SUPERADMIN</span> Permanently delete a user account. Cannot delete the founding admin or yourself. Action is logged.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/admin/transfer-crown" data-body='{"userId":""}'>
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/admin/transfer-crown</span></div>
    <div class="endpoint-desc"><span class="role role-superadmin">SUPERADMIN</span> Transfer the founding-admin crown to another admin. The target must already be an admin. Action is logged.
<pre>{ "userId": "string" }</pre>
    </div>
  </div>

  <!-- ── Admin: Server Config ───────────────────────────────────────────── -->
  <hr id="admin-config" />
  <h2>Admin · Server Config</h2>

  <div class="endpoint" data-method="GET" data-path="/api/admin/server-config">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/admin/server-config</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Get the current server configuration.</div>
  </div>

  <div class="endpoint" data-method="PUT" data-path="/api/admin/server-config" data-body='{"requireEmailVerification":false,"requireWhitelist":false,"allowProjectCreation":true,"announcementsEnabled":true,"announcementPostRole":"admin_and_owners"}'>
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/admin/server-config</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Update server configuration. All fields are optional - only provided fields are changed. Enabling <code>requireEmailVerification</code> for the first time automatically sends verification emails to all unverified users (requires SMTP to be configured).
<pre>{
  "requireEmailVerification": "boolean? - force users to verify email before accessing the app",
  "requireWhitelist": "boolean? - restrict registration to email whitelist patterns",
  "allowProjectCreation": "boolean? - allow non-admin users to create projects",
  "announcementsEnabled": "boolean? - enable the announcements feature",
  "announcementPostRole": "admin | admin_and_owners | all - who can post announcements"
}</pre>
    </div>
  </div>

  <!-- ── Admin: Email Whitelist ─────────────────────────────────────────── -->
  <hr id="admin-whitelist" />
  <h2>Admin · Email Whitelist</h2>
  <p>When <code>requireWhitelist</code> is enabled, only email addresses matching a whitelist pattern can register. Patterns are either a full email address or a domain like <code>@company.com</code>.</p>

  <div class="endpoint" data-method="GET" data-path="/api/admin/whitelist">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/admin/whitelist</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> List all whitelist patterns.</div>
  </div>

  <div class="endpoint" data-method="POST" data-path="/api/admin/whitelist" data-body='{"pattern":"@company.com"}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/admin/whitelist</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Add a whitelist pattern. Must be a full email (e.g. <code>user@example.com</code>) or a domain starting with <code>@</code> (e.g. <code>@company.com</code>).
<pre>{ "pattern": "string" }</pre>
    </div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/admin/whitelist/:id">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/admin/whitelist/:id</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Remove a whitelist pattern.</div>
  </div>

  <!-- ── Admin: Statistics ──────────────────────────────────────────────── -->
  <hr id="admin-stats" />
  <h2>Admin · Statistics</h2>

  <div class="endpoint" data-method="GET" data-path="/api/admin/stats">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/admin/stats</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Server-wide statistics.
<pre>{
  "userCount": 42,
  "projectCount": 18,
  "taskCount": 1204,
  "messageCount": 3450,
  "newUsers": 5,       // last 30 days
  "newProjects": 3     // last 30 days
}</pre>
    </div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/admin/projects">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/admin/projects</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> List all projects on the server with owner, member count, and task count. Useful for server oversight.</div>
  </div>

  <!-- ── Admin: Audit Logs ──────────────────────────────────────────────── -->
  <hr id="admin-logs" />
  <h2>Admin · Audit Logs</h2>
  <p>Every admin action (user promotion, config changes, crown transfer, etc.) is recorded in the audit log. Logs are paginated using cursor-based pagination.</p>

  <div class="endpoint" data-method="GET" data-path="/api/admin/logs">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/admin/logs</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> List audit log entries. Query params: <code>?limit=50</code> (max 200), <code>?cursor=</code> (for pagination), <code>?action=</code> (filter by action type), <code>?from=</code> and <code>?to=</code> (ISO8601 date range).
<pre>{
  "logs": [{ "id": "...", "action": "USER_PROMOTED", "actorName": "admin", "targetName": "alice", "createdAt": "..." }],
  "nextCursor": "log_id_for_next_page | null"
}</pre>
    </div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/admin/logs/export">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/admin/logs/export</span></div>
    <div class="endpoint-desc"><span class="role role-admin">ADMIN</span> Stream the full audit log as a downloadable file. Query params: <code>?format=csv</code> (default) or <code>?format=jsonl</code>, plus optional <code>action</code>, <code>from</code>, <code>to</code> filters. Returns a <code>Content-Disposition: attachment</code> response.</div>
  </div>

  <div class="endpoint" data-method="DELETE" data-path="/api/admin/logs/prune" data-body='{"olderThanDays":90}'>
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/admin/logs/prune</span></div>
    <div class="endpoint-desc"><span class="role role-superadmin">SUPERADMIN</span> Permanently delete audit log entries older than N days. The prune action itself is recorded in the log.
<pre>{ "olderThanDays": 90 }</pre>
    </div>
  </div>

</main>
</div>

<script>
(function () {
  var STORAGE_KEY = 'planly_api_token';
  var tokenInput = document.getElementById('token-input');
  var tokStatus  = document.getElementById('tok-status');

  var saved = sessionStorage.getItem(STORAGE_KEY) || '';
  tokenInput.value = saved;
  updateTokStatus(saved);

  tokenInput.addEventListener('input', function () {
    var v = tokenInput.value.trim();
    sessionStorage.setItem(STORAGE_KEY, v);
    updateTokStatus(v);
  });

  function updateTokStatus(tok) {
    if (!tok) { tokStatus.textContent = ''; return; }
    tokStatus.textContent = tok.startsWith('planly_') ? '✓ token set' : '⚠ unexpected format';
    tokStatus.style.color = tok.startsWith('planly_') ? '#10b981' : '#f59e0b';
  }

  function getToken() {
    return tokenInput.value.trim() || sessionStorage.getItem(STORAGE_KEY) || '';
  }

  document.querySelectorAll('.endpoint[data-method]').forEach(function (ep) {
    var method  = ep.getAttribute('data-method');
    var rawPath = ep.getAttribute('data-path');
    var defBody = ep.getAttribute('data-body') || '';

    var hasBody = ['POST', 'PATCH', 'PUT'].includes(method);

    var pathPart  = rawPath.split('?')[0];
    var queryPart = rawPath.includes('?') ? rawPath.split('?')[1] : '';

    var params = [];
    var re = /:([a-zA-Z]+)/g;
    var m;
    while ((m = re.exec(pathPart)) !== null) params.push(m[1]);

    var queryParams = [];
    if (queryPart) {
      queryPart.split('&').forEach(function (kv) {
        var k = kv.split('=')[0];
        if (k) queryParams.push(k);
      });
    }

    var header = ep.querySelector('.endpoint-header');
    var btn = document.createElement('button');
    btn.className = 'try-btn';
    btn.textContent = 'Try it';
    header.appendChild(btn);

    var panel = document.createElement('div');
    panel.className = 'try-panel';

    var html = '';

    if (params.length > 0) {
      html += '<div class="try-section"><div class="try-section-label">Path parameters</div>';
      params.forEach(function (p) {
        var val = sessionStorage.getItem('pp_' + p) || '';
        html += '<div class="param-row"><label>:' + p + '</label>'
          + '<input class="path-param" data-param="' + p + '" type="text" value="' + escHtml(val) + '" placeholder="' + p + '" /></div>';
      });
      html += '</div>';
    }

    if (queryParams.length > 0) {
      html += '<div class="try-section"><div class="try-section-label">Query parameters</div>';
      queryParams.forEach(function (p) {
        html += '<div class="param-row"><label>?' + p + '</label>'
          + '<input class="query-param" data-param="' + p + '" type="text" value="" placeholder="value" /></div>';
      });
      html += '</div>';
    }

    if (hasBody) {
      var pretty = defBody;
      try { pretty = JSON.stringify(JSON.parse(defBody), null, 2); } catch (e) {}
      html += '<div class="try-section"><div class="try-section-label">Request body (JSON)</div>'
        + '<textarea class="body-editor" rows="7">'
        + escHtml(pretty) + '</textarea></div>';
    }

    html += '<div class="try-actions">'
      + '<button class="send-btn">' + method + ' →</button>'
      + '<button class="copy-btn" style="display:none">Copy response</button>'
      + '</div>'
      + '<div class="response-box">'
      + '<div class="response-status"></div>'
      + '<pre class="response-body"></pre>'
      + '</div>';

    panel.innerHTML = html;
    ep.appendChild(panel);

    panel.querySelectorAll('.path-param').forEach(function (inp) {
      inp.addEventListener('input', function () {
        sessionStorage.setItem('pp_' + inp.getAttribute('data-param'), inp.value);
      });
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.classList.contains('visible');
      panel.classList.toggle('visible', !open);
      btn.classList.toggle('open', !open);
      btn.textContent = open ? 'Try it' : 'Close';
      if (!open) {
        var first = panel.querySelector('input, textarea');
        if (first) first.focus();
      }
    });
    header.addEventListener('click', function () { btn.click(); });

    var copyBtn = panel.querySelector('.copy-btn');
    copyBtn.addEventListener('click', function () {
      var text = panel.querySelector('.response-body').textContent;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = 'Copy response'; }, 1500);
      });
    });

    var sendBtn = panel.querySelector('.send-btn');
    sendBtn.addEventListener('click', async function () {
      var tok = getToken();
      if (!tok) { alert('Paste your Bearer token in the token bar at the top first.'); return; }

      var url = pathPart;
      panel.querySelectorAll('.path-param').forEach(function (inp) {
        url = url.replace(':' + inp.getAttribute('data-param'), encodeURIComponent(inp.value || inp.getAttribute('data-param')));
      });

      var qParts = [];
      panel.querySelectorAll('.query-param').forEach(function (inp) {
        if (inp.value) qParts.push(encodeURIComponent(inp.getAttribute('data-param')) + '=' + encodeURIComponent(inp.value));
      });
      if (qParts.length) url += '?' + qParts.join('&');

      var opts = {
        method: method,
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }
      };

      if (hasBody) {
        var bodyEl = panel.querySelector('.body-editor');
        opts.body = bodyEl.value;
      }

      sendBtn.textContent = '…';
      sendBtn.disabled = true;

      var responseBox    = panel.querySelector('.response-box');
      var responseStatus = panel.querySelector('.response-status');
      var responseBody   = panel.querySelector('.response-body');

      try {
        var res  = await fetch(url, opts);
        var text = await res.text();
        var formatted = text;
        try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch (e) {}

        var ok = res.status < 400;
        responseBox.style.display = 'block';
        responseStatus.textContent = res.status + ' ' + res.statusText;
        responseStatus.style.background = ok ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)';
        responseStatus.style.color      = ok ? '#10b981' : '#f87171';
        responseStatus.style.borderBottom = '1px solid ' + (ok ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)');
        responseBody.textContent = formatted;
        copyBtn.style.display = '';
      } catch (err) {
        responseBox.style.display = 'block';
        responseStatus.textContent = 'Network error';
        responseStatus.style.background = 'rgba(239,68,68,.12)';
        responseStatus.style.color = '#f87171';
        responseBody.textContent = String(err);
      } finally {
        sendBtn.textContent = method + ' →';
        sendBtn.disabled = false;
      }
    });
  });

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
</script>
</body>
</html>`;

export async function docsRoutes(app: FastifyInstance) {
  app.get('/api/docs', { preHandler: requireAuth }, async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.send(HTML.replace(/PLANLY_ORIGIN/g, config.frontendOrigin));
  });
}
