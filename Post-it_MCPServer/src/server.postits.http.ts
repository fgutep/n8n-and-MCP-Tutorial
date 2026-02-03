/* ----------------------------------------------------------------------
 * Post-it Board MCP  (Streamable-HTTP gateway)
 * ----------------------------------------------------------------------
 *  • One global McpServer, supports concurrent sessions via Streamable HTTP.
 *  • Tools: create/list/update/delete/clear
 *  • In-memory store with TTL: notes auto-expire 10 minutes after creation.
 * -------------------------------------------------------------------- */

import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import dotenv from "dotenv";

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// Load env
dotenv.config();
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: ".env.production", override: true });
}

/* ────── 1 · Simple in-memory store (TTL) ───────────────────────────── */
const TTL_MS = 10 * 60 * 1000; // 10 minutes

type Postit = {
  id: string;
  title: string;
  description: string;
  author: string;
  createdAt: number;  // epoch ms
  expiresAt: number;  // epoch ms
  updatedAt: number;  // epoch ms
};

const postits = new Map<string, Postit>();
const timers  = new Map<string, NodeJS.Timeout>();

function now() {
  return Date.now();
}

function scheduleExpiry(id: string, expiresAt: number) {
  // Clear any previous timer
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);

  const delay = Math.max(0, expiresAt - now());
  const t = setTimeout(() => {
    postits.delete(id);
    timers.delete(id);
  }, delay);

  timers.set(id, t);
}

function safeTrim(s: string) {
  return (s ?? "").toString().trim();
}

function pruneExpired() {
  const t = now();
  for (const [id, p] of postits.entries()) {
    if (p.expiresAt <= t) {
      postits.delete(id);
      const timer = timers.get(id);
      if (timer) clearTimeout(timer);
      timers.delete(id);
    }
  }
}

/* ────── 2 · Global MCP server ──────────────────────────────────────── */
const mcpServer = new McpServer({
  name: "Postit Board MCP",
  version: "0.0.1",
  description: "Ultra-simple demo MCP: CRUD post-its with 10-min auto-expiry",
});

/* ────── 3 · Tool registrations ─────────────────────────────────────── */
mcpServer.registerTool(
  "createPostit",
  {
    title: "Create a post-it",
    description: "Creates a new post-it note on the shared board (expires in 10 minutes).",
    inputSchema: {
      title: z.string().min(1).max(80),
      description: z.string().min(1).max(500),
      author: z.string().min(1).max(40),
    },
  },
  async ({ title, description, author }) => {
    pruneExpired();

    const id = randomUUID().slice(0, 8);
    const t = now();
    const p: Postit = {
      id,
      title: safeTrim(title),
      description: safeTrim(description),
      author: safeTrim(author),
      createdAt: t,
      updatedAt: t,
      expiresAt: t + TTL_MS,
    };

    postits.set(id, p);
    scheduleExpiry(id, p.expiresAt);

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, postit: p }) }],
    };
  }
);

mcpServer.registerTool(
  "listPostits",
  {
    title: "List post-its",
    description: "Lists all non-expired post-its (newest first).",
    inputSchema: {},
  },
  async () => {
    pruneExpired();

    const items = Array.from(postits.values()).sort((a, b) => b.createdAt - a.createdAt);

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, postits: items }) }],
    };
  }
);

mcpServer.registerTool(
  "updatePostit",
  {
    title: "Update a post-it",
    description: "Updates title/description/author of a post-it by id (keeps original expiry).",
    inputSchema: {
      id: z.string().min(1),
      title: z.string().min(1).max(80).optional(),
      description: z.string().min(1).max(500).optional(),
      author: z.string().min(1).max(40).optional(),
    },
  },
  async ({ id, title, description, author }) => {
    pruneExpired();

    const p = postits.get(id);
    if (!p) {
      return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Not found" }) }] };
    }

    if (title !== undefined) p.title = safeTrim(title);
    if (description !== undefined) p.description = safeTrim(description);
    if (author !== undefined) p.author = safeTrim(author);

    p.updatedAt = now();
    postits.set(id, p);

    // Keep expiry the same, but re-schedule in case server clock/timer changed
    scheduleExpiry(id, p.expiresAt);

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, postit: p }) }],
    };
  }
);

mcpServer.registerTool(
  "deletePostit",
  {
    title: "Delete a post-it",
    description: "Deletes a post-it by id.",
    inputSchema: { id: z.string().min(1) },
  },
  async ({ id }) => {
    pruneExpired();

    const existed = postits.delete(id);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: existed }) }],
    };
  }
);

mcpServer.registerTool(
  "clearBoard",
  {
    title: "Clear the board",
    description: "Deletes all post-its immediately.",
    inputSchema: {},
  },
  async () => {
    for (const [id, timer] of timers.entries()) {
      clearTimeout(timer);
      timers.delete(id);
    }
    postits.clear();

    return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
  }
);

/* Optional: give agents a single “board snapshot” resource-like tool */
mcpServer.registerTool(
  "getBoardSnapshot",
  {
    title: "Board snapshot",
    description: "Returns a compact markdown snapshot of the board (useful as agent context).",
    inputSchema: {},
  },
  async () => {
    pruneExpired();

    const items = Array.from(postits.values()).sort((a, b) => b.createdAt - a.createdAt);
    const lines = ["# Post-it Board"];
    if (items.length === 0) lines.push("_Empty_");
    for (const p of items) {
      const mins = Math.max(0, Math.ceil((p.expiresAt - now()) / 60000));
      lines.push(`- [${p.id}] **${p.title}** — ${p.description} *(by ${p.author}, expires in ~${mins}m)*`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

/* ────── 4 · Express bootstrap (same pattern you have) ───────────────── */
const app = express();
app.use(express.json({ limit: "1mb" }));

const corsOrigin = process.env.CORS_ORIGIN?.split(",") ?? [];
app.use(
  cors({
    origin: corsOrigin.length ? corsOrigin : false,
    exposedHeaders: ["mcp-session-id"],
    allowedHeaders: ["content-type", "mcp-session-id"],
  })
);

/* Active transports keyed by session-id */
const transports: Record<string, StreamableHTTPServerTransport> = {};

function createTransport(): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      transports[id] = transport;
    },

    enableDnsRebindingProtection: process.env.ENABLE_DNS_REBINDING_PROTECTION === "true",
    allowedHosts: process.env.ALLOWED_HOSTS?.split(","),
  });

  void mcpServer.connect(transport);

  transport.onclose = () => {
    if (transport.sessionId) delete transports[transport.sessionId];
  };

  return transport;
}

/* ────── 5 · /mcp routes ────────────────────────────────────────────── */
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    let transport = sid ? transports[sid] : undefined;

    // First message of a new session must be "initialize"
    if (!transport && isInitializeRequest(req.body)) {
      transport = createTransport();
    }

    if (!transport) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session id" },
        id: (req.body as any)?.id ?? null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[POST /mcp] Unhandled error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: (req.body as any)?.id ?? null,
      });
    }
  }
});

const reuseSession = async (req: Request, res: Response) => {
  try {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    const transport = sid ? transports[sid] : undefined;

    if (!transport) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session id" },
        id: null,
      });
      return;
    }
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error(`[${req.method} /mcp] Unhandled error:`, err);
    if (!res.headersSent) res.status(500).end();
  }
};

app.get("/mcp", reuseSession);     // SSE stream
app.delete("/mcp", reuseSession);  // session termination

/* ────── 6 · Minimal visual board (optional but nice for demo) ─────────
 * This is NOT required for MCP itself; it just makes it visual.
 */
app.get("/api/postits", (_req, res) => {
  pruneExpired();
  const items = Array.from(postits.values()).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, postits: items, ttlMinutes: 10 });
});

app.get("/", (_req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Post-it Board MCP</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --cork: #b8956a;
      --cork-dark: #9d7d54;
      --yellow: #fef68a;
      --yellow-dark: #ffd700;
      --pink: #ffb6d9;
      --blue: #a8d8ff;
      --green: #b8f5cd;
      --orange: #ffc896;
      --shadow: rgba(0, 0, 0, 0.15);
      --shadow-hover: rgba(0, 0, 0, 0.25);
    }
    
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      margin: 0;
      background: linear-gradient(135deg, var(--cork) 0%, var(--cork-dark) 100%);
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }
    
    /* Cork texture overlay */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        radial-gradient(circle at 20% 50%, rgba(0,0,0,0.03) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(0,0,0,0.03) 0%, transparent 50%),
        radial-gradient(circle at 40% 80%, rgba(0,0,0,0.03) 0%, transparent 50%);
      pointer-events: none;
      opacity: 0.6;
    }
    
    header {
      position: sticky;
      top: 0;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-bottom: 3px solid var(--cork-dark);
      padding: 20px 24px;
      z-index: 100;
      box-shadow: 0 4px 20px var(--shadow);
    }
    
    header .title-row {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    
    header h1 {
      font-family: 'Caveat', cursive;
      font-size: 36px;
      font-weight: 700;
      color: var(--cork-dark);
      margin: 0;
      letter-spacing: -0.5px;
    }
    
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--yellow);
      border: 2px solid var(--yellow-dark);
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 2px 8px var(--shadow);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .pill:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px var(--shadow);
    }
    
    .pill code {
      background: rgba(255, 255, 255, 0.7);
      padding: 2px 8px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }
    
    .wrap {
      padding: 40px 24px;
      max-width: 1400px;
      margin: 0 auto;
      position: relative;
    }
    
    .empty-state {
      text-align: center;
      padding: 80px 20px;
      color: rgba(255, 255, 255, 0.9);
      font-family: 'Caveat', cursive;
      font-size: 32px;
      animation: fadeIn 0.6s ease;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 32px;
      animation: fadeIn 0.6s ease;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes popIn {
      0% { transform: rotate(var(--r)) scale(0.8); opacity: 0; }
      50% { transform: rotate(var(--r)) scale(1.05); }
      100% { transform: rotate(var(--r)) scale(1); opacity: 1; }
    }
    
    .note {
      background: var(--color);
      border: none;
      border-radius: 4px;
      padding: 24px;
      box-shadow: 
        0 1px 3px var(--shadow),
        0 8px 24px var(--shadow);
      transform: rotate(var(--r));
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      cursor: pointer;
      position: relative;
      animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      animation-delay: var(--delay);
      animation-fill-mode: backwards;
    }
    
    /* Pin effect */
    .note::before {
      content: '';
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      width: 12px;
      height: 12px;
      background: radial-gradient(circle, #e74c3c 0%, #c0392b 100%);
      border-radius: 50%;
      box-shadow: 
        0 2px 4px rgba(0, 0, 0, 0.3),
        inset 0 1px 2px rgba(255, 255, 255, 0.3);
    }
    
    .note::after {
      content: '';
      position: absolute;
      top: 21px;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      height: 8px;
      background: linear-gradient(to bottom, #a93226, transparent);
      opacity: 0.4;
    }
    
    .note:hover {
      transform: rotate(0deg) translateY(-8px) scale(1.02);
      box-shadow: 
        0 4px 8px var(--shadow),
        0 16px 40px var(--shadow-hover);
      z-index: 10;
    }
    
    .note h3 {
      font-family: 'Caveat', cursive;
      font-size: 26px;
      font-weight: 700;
      color: #2c3e50;
      margin: 0 0 12px;
      padding-top: 8px;
      line-height: 1.2;
      word-wrap: break-word;
    }
    
    .note p {
      font-size: 15px;
      line-height: 1.6;
      color: #34495e;
      margin: 0 0 20px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;
      color: #5a6c7d;
      border-top: 2px dashed rgba(0, 0, 0, 0.1);
      padding-top: 16px;
    }
    
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    
    .meta .id {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      background: rgba(0, 0, 0, 0.08);
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 500;
    }
    
    .meta .author {
      font-weight: 600;
      color: #2c3e50;
    }
    
    .meta .expire {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
      color: #e74c3c;
    }
    
    .meta .expire::before {
      content: '⏱';
      font-size: 14px;
    }
    
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; gap: 24px; }
      header h1 { font-size: 28px; }
      .wrap { padding: 24px 16px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="title-row">
      <h1>🗒️ Post-it Board</h1>
      <span class="pill">
        <span>MCP Endpoint</span>
        <code>/mcp</code>
      </span>
      <span class="pill">
        <span>⏱ Auto-expire</span>
        <code>10min</code>
      </span>
    </div>
  </header>
  <div class="wrap">
    <div id="grid" class="grid"></div>
  </div>
<script>
  const colors = ['var(--yellow)', 'var(--pink)', 'var(--blue)', 'var(--green)', 'var(--orange)'];
  const randRot = () => (Math.random() * 6 - 3).toFixed(2) + "deg";
  const randColor = () => colors[Math.floor(Math.random() * colors.length)];
  const esc = s => (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function refresh() {
    try {
      const r = await fetch("/api/postits");
      const j = await r.json();
      const grid = document.getElementById("grid");
      
      if (!j.postits || j.postits.length === 0) {
        grid.innerHTML = '<div class="empty-state">No post-its yet... The board is empty! ✨</div>';
        return;
      }
      
      grid.innerHTML = "";
      j.postits.forEach((p, idx) => {
        const mins = Math.max(0, Math.ceil((p.expiresAt - Date.now()) / 60000));
        const el = document.createElement("div");
        el.className = "note";
        el.style.setProperty("--r", randRot());
        el.style.setProperty("--color", randColor());
        el.style.setProperty("--delay", (idx * 0.05) + "s");
        el.innerHTML = \`
          <h3>\${esc(p.title)}</h3>
          <p>\${esc(p.description)}</p>
          <div class="meta">
            <div class="meta-row">
              <span class="id">#\${esc(p.id)}</span>
              <span class="expire">\${mins}m</span>
            </div>
            <div class="meta-row">
              <span>by <span class="author">\${esc(p.author)}</span></span>
            </div>
          </div>\`;
        grid.appendChild(el);
      });
    } catch (err) {
      console.error('Failed to refresh:', err);
    }
  }
  
  refresh();
  setInterval(refresh, 2000);
</script>
</body>
</html>
  `.trim());
});

/* ────── 7 · Health probe ───────────────────────────────────────────── */
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

/* ────── 8 · Launch ─────────────────────────────────────────────────── */
const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => console.log(`🔗 Post-it MCP listening on port ${PORT}`));
