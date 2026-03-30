import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { healthRoute } from "./routes/health";
import { createWSHandler } from "./ws";
import type { WSData } from "./store";
import { validatePrompts } from "./agents/prompt-loader";
import { initDb } from "./db";
import { getDevServerPort, stopAllDevServers } from "./chat/dev-server";
import { destroyAllSandboxes, getSandboxPreviewUrl, reconcileSandboxes, startIdleCleanup, stopIdleCleanup } from "./chat/sandbox-manager";
import { storage } from "./storage";
import { createChildLogger } from "./logger";

const log = createChildLogger("server");

initDb();
validatePrompts();

const app = new Hono();

app.use("*", cors());
app.use("*", honoLogger());

app.route("/api", healthRoute);

// Proxy preview requests — sandbox first, then local dev server, then static
app.all("/preview/:conversationId/*", async (c) => {
  const conversationId = c.req.param("conversationId");
  const filePath = c.req.path.replace(`/preview/${conversationId}`, "") || "/";
  const prefix = `/preview/${conversationId}`;

  // Rewrite absolute paths in text responses so sub-resources route back through the proxy.
  // Without this, the sandbox HTML contains src="/src/main.tsx" which resolves to the AVV
  // frontend's source (same origin) instead of the sandbox's.
  function rewriteResponse(res: Response): Response {
    const ct = res.headers.get("content-type") ?? "";
    const isText = ct.includes("html") || ct.includes("javascript") || ct.includes("css");
    if (!isText) {
      return new Response(res.body, { status: res.status, headers: res.headers });
    }
    // Stream → text, rewrite paths, return new response
    return new Response(
      new ReadableStream({
        async start(controller) {
          const text = await res.text();
          // Rewrite absolute paths: "/src/..." → "/preview/{cid}/src/..."
          // Match src="/ href="/ from "/ import("/ import "/ but NOT "//" (protocol-relative)
          const rewritten = text.replace(
            /(?<=(from\s+|import\s*\(|import\s+)\s*["']|(?:src|href|action)=["'])\/((?!preview\/|\/)[^"'\s])/g,
            `${prefix}/$2`,
          );
          controller.enqueue(new TextEncoder().encode(rewritten));
          controller.close();
        },
      }),
      {
        status: res.status,
        headers: res.headers,
      },
    );
  }

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
      return rewriteResponse(proxyRes);
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
      return rewriteResponse(proxyRes);
    } catch {
      // Dev server not responding, fall through
    }
  }

  // 3. Fallback: serve from storage (R2 in prod, local in dev)
  const staticPath = filePath.replace(/^\//, "") || "index.html";

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

  const mime = mimeTypes[ext ?? ""] ?? "application/octet-stream";
  const raw = new Response(Buffer.from(content), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-cache",
    },
  });

  return rewriteResponse(raw);
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

log.info({ port }, "AVV API running");
log.info({ port }, "WebSocket available");

// Reconcile persisted sandboxes with the AgentBox server, then start idle cleanup
reconcileSandboxes()
  .catch((err) => log.warn({ err }, "Sandbox reconciliation failed"))
  .finally(() => startIdleCleanup());

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
