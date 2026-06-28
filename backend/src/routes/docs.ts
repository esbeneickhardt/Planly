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
  nav a { display: block; padding: 6px 20px; font-size: 13px; color: #94a3b8; text-decoration: none; transition: color .15s, background .15s; border-radius: 0; }
  nav a:hover { color: #e2e8f0; background: #252836; }
  nav .section { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #4a5568; padding: 14px 20px 4px; }
  main { flex: 1; padding: 40px 48px; max-width: 860px; }
  h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #f1f5f9; }
  h3 { font-size: 15px; font-weight: 600; margin: 32px 0 8px; color: #e2e8f0; }
  p, li { font-size: 14px; color: #94a3b8; margin-bottom: 8px; }
  ul { padding-left: 20px; }
  code { font-family: "Fira Code", "Cascadia Code", monospace; font-size: 13px; }
  .endpoint { margin-bottom: 24px; border: 1px solid #2a2d3e; border-radius: 10px; overflow: hidden; }
  .endpoint-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #1a1d27; }
  .method { font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 5px; letter-spacing: .04em; }
  .GET { background: rgba(16,185,129,.15); color: #10b981; }
  .POST { background: rgba(99,102,241,.15); color: #818cf8; }
  .PATCH { background: rgba(245,158,11,.15); color: #f59e0b; }
  .PUT { background: rgba(59,130,246,.15); color: #60a5fa; }
  .DELETE { background: rgba(239,68,68,.15); color: #f87171; }
  .path { font-family: monospace; font-size: 13px; color: #e2e8f0; }
  .endpoint-desc { padding: 10px 14px; font-size: 13px; color: #94a3b8; background: #0f1117; }
  .auth-box { background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 10px; padding: 16px 20px; margin-bottom: 28px; }
  .auth-box code { background: #252836; padding: 2px 6px; border-radius: 4px; color: #a78bfa; }
  pre { background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-size: 13px; color: #94a3b8; margin: 8px 0 0; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 20px; background: rgba(167,139,250,.12); color: #a78bfa; border: 1px solid rgba(167,139,250,.25); margin-bottom: 24px; }
  hr { border: none; border-top: 1px solid #2a2d3e; margin: 32px 0; }
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
  <a href="#permissions">Permissions</a>
</nav>
<main>
  <h2>Planly API Reference</h2>
  <span class="badge">REST · JSON · Bearer Auth</span>

  <div class="auth-box">
    <h3 style="margin-top:0">Base URL</h3>
    <p>All endpoints are relative to: <code>PLANLY_ORIGIN/api</code></p>
    <h3>Authentication</h3>
    <p>Generate a Personal Access Token under <strong>Account → Integrations</strong> in the app, then include it in every request:</p>
    <pre>Authorization: Bearer &lt;YOUR_TOKEN&gt;</pre>
    <p style="margin-top:8px">Tokens also work as a query parameter: <code>?token=&lt;YOUR_TOKEN&gt;</code></p>
  </div>

  <hr id="me" />
  <h2>Current User</h2>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/me</span></div>
    <div class="endpoint-desc">Returns the authenticated user's profile.</div>
  </div>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/me/permissions</span></div>
    <div class="endpoint-desc">Returns all projects the user belongs to, their role, and per-tab permission levels (<code>read</code> or <code>write</code>).
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

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products</span></div>
    <div class="endpoint-desc">List all products the user has access to.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc">Get a single product by ID.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products</span></div>
    <div class="endpoint-desc">Create a new product.
<pre>{ "name": "string", "emoji": "string?", "description": "string?", "deadline": "ISO8601" }</pre></div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc">Update a product. Owners may also set <code>ownerId</code> to transfer ownership.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:id</span></div>
    <div class="endpoint-desc">Delete a product and all its data. Owner only.</div>
  </div>

  <hr id="tasks" />
  <h2>Tasks</h2>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/tasks</span></div>
    <div class="endpoint-desc">List all tasks for a product.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/tasks/:id</span></div>
    <div class="endpoint-desc">Get a single task.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/tasks</span></div>
    <div class="endpoint-desc">Create a task.
<pre>{ "name": "string", "description": "string?", "deadline": "ISO8601?", "ownerId": "userId?", "color": "hex?" }</pre></div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/tasks/:id</span></div>
    <div class="endpoint-desc">Update a task. Supports <code>name</code>, <code>description</code>, <code>status</code>, <code>deadline</code>, <code>ownerId</code>, <code>color</code>.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/tasks/:id</span></div>
    <div class="endpoint-desc">Delete a task.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/tasks/reorder</span></div>
    <div class="endpoint-desc">Reorder tasks within their columns.
<pre>{ "updates": [{ "taskId": "string", "order": 0 }] }</pre></div>
  </div>

  <hr id="milestones" />
  <h2>Milestones</h2>
  <p>Milestones are tasks with a deadline. Use the tasks endpoints and set <code>deadline</code>.</p>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/milestones</span></div>
    <div class="endpoint-desc">List milestones (tasks with a deadline) with dependency and connection info.</div>
  </div>

  <hr id="sprints" />
  <h2>Sprints</h2>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/sprints</span></div>
    <div class="endpoint-desc">List sprints for a product.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/sprints</span></div>
    <div class="endpoint-desc">Create a sprint.
<pre>{ "name": "string", "startDate": "ISO8601", "endDate": "ISO8601" }</pre></div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method PATCH">PATCH</span><span class="path">/api/products/:productId/sprints/:id</span></div>
    <div class="endpoint-desc">Update sprint details or <code>taskIds</code> (array of task IDs in this sprint).</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/products/:productId/sprints/:id</span></div>
    <div class="endpoint-desc">Delete a sprint.</div>
  </div>

  <hr id="messages" />
  <h2>Messages</h2>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/messages</span></div>
    <div class="endpoint-desc">List messages for the product chat. Optional query param <code>taskId</code> to scope to a task thread.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/products/:productId/messages</span></div>
    <div class="endpoint-desc">Post a message.
<pre>{ "content": "string", "taskId": "string?" }</pre></div>
  </div>

  <hr id="search" />
  <h2>Search</h2>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/search?q=&lt;query&gt;</span></div>
    <div class="endpoint-desc">Search tasks and messages across all accessible products. Returns <code>{ tasks, messages }</code>.</div>
  </div>

  <hr id="tokens" />
  <h2>API Tokens</h2>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/api-tokens</span></div>
    <div class="endpoint-desc">List your personal access tokens.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method POST">POST</span><span class="path">/api/api-tokens</span></div>
    <div class="endpoint-desc">Create a new token. The raw token value is only returned once.
<pre>{ "name": "string", "expiresAt": "ISO8601?" }</pre></div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method DELETE">DELETE</span><span class="path">/api/api-tokens/:id</span></div>
    <div class="endpoint-desc">Revoke a token.</div>
  </div>

  <hr id="permissions" />
  <h2>Permissions</h2>

  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/me/permissions</span></div>
    <div class="endpoint-desc">Get your permission levels for all projects you belong to.</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method GET">GET</span><span class="path">/api/products/:productId/permissions</span></div>
    <div class="endpoint-desc">Get all member permissions for a specific product (owner/co-owner only).</div>
  </div>
  <div class="endpoint">
    <div class="endpoint-header"><span class="method PUT">PUT</span><span class="path">/api/products/:productId/permissions</span></div>
    <div class="endpoint-desc">Set permissions for members. Owner/co-owner only.
<pre>[{ "userId": "string", "tab": "kanban|gantt|chat", "level": "read|write" }]</pre></div>
  </div>

</main>
</div>
</body>
</html>`;

export async function docsRoutes(app: FastifyInstance) {
  app.get('/api/docs', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.send(HTML.replace('PLANLY_ORIGIN', config.frontendOrigin));
  });
}
