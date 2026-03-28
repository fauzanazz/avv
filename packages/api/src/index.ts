import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoute } from "./routes/health";
import { createWSHandler } from "./ws";
import { previewStore } from "./preview-store";
import type { WSData } from "./store";
import { validatePrompts } from "./agents/prompt-loader";
import { initDb } from "./db";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { getDevServerPort, stopAllDevServers } from "./chat/dev-server";
import { destroyAllSandboxes } from "./chat/sandbox-manager";

initDb();
validatePrompts();

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.route("/api", healthRoute);

// Proxy preview requests to the Vite dev server, fallback to static file serving
app.all("/preview/:conversationId/*", async (c) => {
  const conversationId = c.req.param("conversationId");

  // Try proxying to Vite dev server first
  const devPort = getDevServerPort(conversationId);
  if (devPort) {
    const filePath = c.req.path.replace(`/preview/${conversationId}`, "") || "/";
    const targetUrl = `http://localhost:${devPort}${filePath}`;

    try {
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
      // Dev server not responding, fall through to static
    }
  }

  // Fallback: serve static files directly
  const projectDir = previewStore.getProjectDir(conversationId);
  if (!projectDir) {
    return c.text("No project found", 404);
  }

  const filePath = c.req.path.replace(`/preview/${conversationId}/`, "");
  const fullPath = join(projectDir, filePath);

  if (!existsSync(fullPath)) {
    return c.text("Not found", 404);
  }

  const content = readFileSync(fullPath);
  const ext = filePath.split(".").pop()?.toLowerCase();

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

  return new Response(content, {
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

// Clean up on shutdown
process.on("SIGINT", async () => {
  stopAllDevServers();
  await destroyAllSandboxes();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  stopAllDevServers();
  await destroyAllSandboxes();
  process.exit(0);
});
