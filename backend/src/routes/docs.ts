import { FastifyInstance } from 'fastify';
import { config } from '../config/env';

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
  main { flex: 1; padding: 40px 48px; max-width: 900px; }
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
  <h1>Planly API</h1>
  <div class="section">Getting Started</div>
  <a href="#auth">Authentication</a>
  <a href="#me">Current User</a>
  <div class="section">Resources</div>
  <a href="#products">Products</a>
  <a href="#tasks">Tasks</a>
  <a href="#milestones">Milestones</a>
  <a href="#sprints">Sprints</a>
  <a href="#messages">Messages</a>
  <a href="#search">Search</a>
  <div class="section">Account</div>
  <a href="#tokens">API Tokens</a>
  <a href="#apps">App Registrations</a>
  <a href="#permissions">Permissions</a>
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

  <div class="auth-box" id="auth">
    <h3 style="margin-top:0">Base URL</h3>
    <p>All endpoints are relative to: <code>PLANLY_ORIGIN</code></p>
    <h3>Authentication</h3>
    <p>Generate a token under <strong>Settings → Apps</strong> or <strong>Account → Integrations</strong>, then include it in every request:</p>
    <pre>Authorization: Bearer &lt;YOUR_TOKEN&gt;</pre>
    <p style="margin-top:8px">Tokens also work as a query parameter: <code>?token=&lt;YOUR_TOKEN&gt;</code></p>
  </div>

  <hr id="me" />
  <h2>Current User</h2>

  <div class="endpoint" data-method="GET" data-path="/api/auth/me">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/auth/me</span></div>
    <div class="endpoint-desc">Returns the authenticated user's profile.</div>
  </div>

  <div class="endpoint" data-method="GET" data-path="/api/me/permissions">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/me/permissions</span></div>
    <div class="endpoint-desc">Returns all projects the user belongs to, their role, and per-tab permission levels.
<pre>[
  {
    "productId": "...",
    "productName": "My Project",
    "productEmoji": "🚀",
    "role": "owner | co_owner | member",
    "permissions": {
      "kanban": "write",
      "gantt": "read"
    }
  }
]</pre>
    </div>
  </div>

  <hr id="products" />
  <h2>Products</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products</span></div>
    <div class="endpoint-desc">List all products the user has access to.</div>
  </div>
  <div class="endpoint" data-method="GET" data-path="/api/products/:id">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc">Get a single product by ID.</div>
  </div>
  <div class="endpoint" data-method="POST" data-path="/api/products" data-body='{"name":"My Project","emoji":"rocket","description":"","deadline":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products</span></div>
    <div class="endpoint-desc">Create a new product.
<pre>{ "name": "string", "emoji": "string?", "description": "string?", "deadline": "ISO8601?" }</pre></div>
  </div>
  <div class="endpoint" data-method="PATCH" data-path="/api/products/:id" data-body='{"name":"Updated name"}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc">Update a product. Owners may also set <code>ownerId</code> to transfer ownership.</div>
  </div>
  <div class="endpoint" data-method="DELETE" data-path="/api/products/:id">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc">Delete a product and all its data. Owner only.</div>
  </div>

  <hr id="tasks" />
  <h2>Tasks</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/tasks">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/tasks</span></div>
    <div class="endpoint-desc">List all tasks for a product.</div>
  </div>
  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/tasks/:taskId">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/tasks/:taskId</span></div>
    <div class="endpoint-desc">Get a single task.</div>
  </div>
  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/tasks" data-body='{"name":"New task","description":"","deadline":"","ownerId":"","color":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/tasks</span></div>
    <div class="endpoint-desc">Create a task.
<pre>{ "name": "string", "description": "string?", "deadline": "ISO8601?", "ownerId": "userId?", "color": "hex?" }</pre></div>
  </div>
  <div class="endpoint" data-method="PATCH" data-path="/api/products/:productId/tasks/:taskId" data-body='{"name":"","status":"","ownerId":""}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/tasks/:taskId</span></div>
    <div class="endpoint-desc">Update a task. Supports <code>name</code>, <code>description</code>, <code>status</code>, <code>deadline</code>, <code>ownerId</code>, <code>color</code>.</div>
  </div>
  <div class="endpoint" data-method="DELETE" data-path="/api/products/:productId/tasks/:taskId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/tasks/:taskId</span></div>
    <div class="endpoint-desc">Delete a task.</div>
  </div>

  <hr id="milestones" />
  <h2>Milestones</h2>
  <p>Milestones are tasks with a deadline. Use the tasks endpoints and set <code>deadline</code>.</p>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/milestones">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/milestones</span></div>
    <div class="endpoint-desc">List milestones (tasks with a deadline) with dependency and progress info.</div>
  </div>

  <hr id="sprints" />
  <h2>Sprints</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/sprints">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/sprints</span></div>
    <div class="endpoint-desc">List sprints for a product.</div>
  </div>
  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/sprints" data-body='{"name":"Sprint 1","startDate":"2026-07-01","endDate":"2026-07-14"}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/sprints</span></div>
    <div class="endpoint-desc">Create a sprint.
<pre>{ "name": "string", "startDate": "ISO8601", "endDate": "ISO8601" }</pre></div>
  </div>
  <div class="endpoint" data-method="PATCH" data-path="/api/products/:productId/sprints/:sprintId" data-body='{"name":"","startDate":"","endDate":""}'>
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/sprints/:sprintId</span></div>
    <div class="endpoint-desc">Update sprint details or <code>taskIds</code> (array of task IDs in this sprint).</div>
  </div>
  <div class="endpoint" data-method="DELETE" data-path="/api/products/:productId/sprints/:sprintId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/sprints/:sprintId</span></div>
    <div class="endpoint-desc">Delete a sprint.</div>
  </div>

  <hr id="messages" />
  <h2>Messages</h2>

  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/messages">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/messages</span></div>
    <div class="endpoint-desc">List messages for the product chat. Optional query param <code>?taskId=</code> to scope to a task thread.</div>
  </div>
  <div class="endpoint" data-method="POST" data-path="/api/products/:productId/messages" data-body='{"content":"Hello from the API","taskId":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/messages</span></div>
    <div class="endpoint-desc">Post a message.
<pre>{ "content": "string", "taskId": "string?" }</pre></div>
  </div>

  <hr id="search" />
  <h2>Search</h2>

  <div class="endpoint" data-method="GET" data-path="/api/search?q=">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/search?q=&lt;query&gt;</span></div>
    <div class="endpoint-desc">Search tasks and messages across all accessible products. Returns <code>{ tasks, messages }</code>.</div>
  </div>

  <hr id="tokens" />
  <h2>API Tokens</h2>

  <div class="endpoint" data-method="GET" data-path="/api/auth/tokens">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/auth/tokens</span></div>
    <div class="endpoint-desc">List your personal access tokens (not app tokens).</div>
  </div>
  <div class="endpoint" data-method="POST" data-path="/api/auth/tokens" data-body='{"name":"My token","expiresAt":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/auth/tokens</span></div>
    <div class="endpoint-desc">Create a new personal token. The raw token value is only returned once.
<pre>{ "name": "string", "expiresAt": "ISO8601?" }</pre></div>
  </div>
  <div class="endpoint" data-method="DELETE" data-path="/api/auth/tokens/:tokenId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/auth/tokens/:tokenId</span></div>
    <div class="endpoint-desc">Revoke a personal token.</div>
  </div>

  <hr id="apps" />
  <h2>App Registrations</h2>

  <div class="endpoint" data-method="GET" data-path="/api/apps">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/apps</span></div>
    <div class="endpoint-desc">List your app registrations.</div>
  </div>
  <div class="endpoint" data-method="POST" data-path="/api/apps" data-body='{"name":"My Integration","description":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/apps</span></div>
    <div class="endpoint-desc">Create a new app registration.
<pre>{ "name": "string", "description": "string?" }</pre></div>
  </div>
  <div class="endpoint" data-method="DELETE" data-path="/api/apps/:appId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/apps/:appId</span></div>
    <div class="endpoint-desc">Delete an app registration and all its tokens.</div>
  </div>
  <div class="endpoint" data-method="GET" data-path="/api/apps/:appId/tokens">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/apps/:appId/tokens</span></div>
    <div class="endpoint-desc">List tokens for an app.</div>
  </div>
  <div class="endpoint" data-method="POST" data-path="/api/apps/:appId/tokens" data-body='{"name":"ci-token","expiresAt":""}'>
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/apps/:appId/tokens</span></div>
    <div class="endpoint-desc">Create a token for an app. Raw token shown once in response.
<pre>{ "name": "string", "expiresAt": "ISO8601?" }</pre></div>
  </div>
  <div class="endpoint" data-method="DELETE" data-path="/api/apps/:appId/tokens/:tokenId">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/apps/:appId/tokens/:tokenId</span></div>
    <div class="endpoint-desc">Revoke an app token.</div>
  </div>

  <hr id="permissions" />
  <h2>Permissions</h2>

  <div class="endpoint" data-method="GET" data-path="/api/me/permissions">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/me/permissions</span></div>
    <div class="endpoint-desc">Get your permission levels for all projects you belong to.</div>
  </div>
  <div class="endpoint" data-method="GET" data-path="/api/products/:productId/permissions">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/permissions</span></div>
    <div class="endpoint-desc">Get all member permissions for a specific product (owner/co-owner only).</div>
  </div>
  <div class="endpoint" data-method="PUT" data-path="/api/products/:productId/permissions" data-body='[{"userId":"","tab":"kanban","level":"read"}]'>
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/products/:productId/permissions</span></div>
    <div class="endpoint-desc">Set permissions for members. Owner/co-owner only.
<pre>[{ "userId": "string", "tab": "kanban|backlog|canvas|gantt", "level": "read|write|none" }]</pre></div>
  </div>

</main>
</div>

<script>
(function () {
  var STORAGE_KEY = 'planly_api_token';
  var tokenInput = document.getElementById('token-input');
  var tokStatus  = document.getElementById('tok-status');

  // Restore saved token
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

  // ── Build try-it panels ──────────────────────────────────────────────────
  document.querySelectorAll('.endpoint[data-method]').forEach(function (ep) {
    var method  = ep.getAttribute('data-method');
    var rawPath = ep.getAttribute('data-path');
    var defBody = ep.getAttribute('data-body') || '';

    var hasBody = ['POST', 'PATCH', 'PUT'].includes(method);

    // Split query string from path
    var pathPart  = rawPath.split('?')[0];
    var queryPart = rawPath.includes('?') ? rawPath.split('?')[1] : '';

    // Extract :param names
    var params = [];
    var re = /:([a-zA-Z]+)/g;
    var m;
    while ((m = re.exec(pathPart)) !== null) params.push(m[1]);

    // Extract query param names from ?foo=bar&baz=
    var queryParams = [];
    if (queryPart) {
      queryPart.split('&').forEach(function (kv) {
        var k = kv.split('=')[0];
        if (k) queryParams.push(k);
      });
    }

    // Add "Try it" button to header
    var header = ep.querySelector('.endpoint-header');
    var btn = document.createElement('button');
    btn.className = 'try-btn';
    btn.textContent = 'Try it';
    header.appendChild(btn);

    // Build panel HTML
    var panel = document.createElement('div');
    panel.className = 'try-panel';

    var html = '';

    // Path params
    if (params.length > 0) {
      html += '<div class="try-section"><div class="try-section-label">Path parameters</div>';
      params.forEach(function (p) {
        var val = sessionStorage.getItem('pp_' + p) || '';
        html += '<div class="param-row"><label>:' + p + '</label>'
          + '<input class="path-param" data-param="' + p + '" type="text" value="' + escHtml(val) + '" placeholder="' + p + '" /></div>';
      });
      html += '</div>';
    }

    // Query params
    if (queryParams.length > 0) {
      html += '<div class="try-section"><div class="try-section-label">Query parameters</div>';
      queryParams.forEach(function (p) {
        html += '<div class="param-row"><label>?' + p + '</label>'
          + '<input class="query-param" data-param="' + p + '" type="text" value="" placeholder="value" /></div>';
      });
      html += '</div>';
    }

    // Body
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

    // Save path param values on change
    panel.querySelectorAll('.path-param').forEach(function (inp) {
      inp.addEventListener('input', function () {
        sessionStorage.setItem('pp_' + inp.getAttribute('data-param'), inp.value);
      });
    });

    // Toggle panel
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

    // Copy response
    var copyBtn = panel.querySelector('.copy-btn');
    copyBtn.addEventListener('click', function () {
      var text = panel.querySelector('.response-body').textContent;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = 'Copy response'; }, 1500);
      });
    });

    // Send
    var sendBtn = panel.querySelector('.send-btn');
    sendBtn.addEventListener('click', async function () {
      var tok = getToken();
      if (!tok) { alert('Paste your Bearer token in the token bar at the top first.'); return; }

      // Build URL
      var url = pathPart;
      panel.querySelectorAll('.path-param').forEach(function (inp) {
        url = url.replace(':' + inp.getAttribute('data-param'), encodeURIComponent(inp.value || inp.getAttribute('data-param')));
      });

      // Append query params
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
  app.get('/api/docs', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.send(HTML.replace(/PLANLY_ORIGIN/g, config.frontendOrigin));
  });
}
