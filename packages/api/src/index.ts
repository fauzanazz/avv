import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoute } from "./routes/health";
import { createWSHandler } from "./ws";
import type { WSData } from "./store";
import { validatePrompts } from "./agents/prompt-loader";
import { initDb } from "./db";
import { getDevServerPort, stopAllDevServers } from "./chat/dev-server";
import { destroyAllSandboxes, getSandboxPreviewUrl, startIdleCleanup, stopIdleCleanup } from "./chat/sandbox-manager";
import { storage } from "./storage";

initDb();
validatePrompts();

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.route("/api", healthRoute);

// Proxy preview requests — sandbox first, then local dev server, then static
app.all("/preview/:conversationId/*", async (c) => {
  const conversationId = c.req.param("conversationId");
  const filePath = c.req.path.replace(`/preview/${conversationId}`, "") || "/";

  // 1. Try proxying to AgentBox sandbox
  const sandboxUrl = getSandboxPreviewUrl(conversationId);
  if (sandboxUrl) {
    try {
      const targetUrl = `${sandboxUrl.replace(/\/$/, "")}${filePath}`;
      const proxyRes = await fetch(targetUrl, {
        method: c.req.method,
        headers: c.req.raw.headers,
        signal: AbortSignal.timeout(5000),
      });
      return new Response(proxyRes.body, {
        status: proxyRes.status,
        headers: proxyRes.headers,
      });
    } catch {
      // Sandbox not responding, fall through
    }
  }

  // 2. Try proxying to local Vite dev server
  const devPort = getDevServerPort(conversationId);
  if (devPort) {
    try {
      const targetUrl = `http://localhost:${devPort}${filePath}`;
      const proxyRes = await fetch(targetUrl, {
        method: c.req.method,
        headers: c.req.raw.headers,
        signal: AbortSignal.timeout(5000),
      });
      return new Response(proxyRes.body, {
        status: proxyRes.status,
        headers: proxyRes.headers,
      });
    } catch {
      // Dev server not responding, fall through
    }
  }

  // 3. Fallback: serve from storage (R2 in prod, local in dev)
  const staticPath = c.req.path.replace(`/preview/${conversationId}/`, "");
  if (!staticPath) {
    return c.text("Not found", 404);
  }

  const content = await storage.getBuffer(conversationId, staticPath);
  if (!content) {
    return c.text("Not found", 404);
  }

  const ext = staticPath.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
  };

  return new Response(Buffer.from(content), {
    headers: {
      "Content-Type": mimeTypes[ext ?? ""] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    },
  });
});

const parsed = Number(process.env.PORT);
const port = Number.isNaN(parsed) ? 3001 : parsed;
const wsHandler = createWSHandler();

Bun.serve<WSData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const conversationId = url.searchParams.get("conversationId");
      const upgraded = server.upgrade(req, { data: { conversationId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: wsHandler,
});

console.log(`AVV API running on http://localhost:${port}`);
console.log(`WebSocket available at ws://localhost:${port}/ws`);

// Start idle sandbox cleanup sweep
startIdleCleanup();

// Clean up on shutdown
process.on("SIGINT", async () => {
  stopIdleCleanup();
  stopAllDevServers();
  await destroyAllSandboxes();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  stopIdleCleanup();
  stopAllDevServers();
  await destroyAllSandboxes();
  process.exit(0);
});
