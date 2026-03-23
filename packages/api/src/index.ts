import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoute } from "./routes/health";
import { sessionRoute } from "./routes/session";
import { generateRoute } from "./routes/generate";
import { createWSHandler } from "./ws";
import type { WSData } from "./store";
import { validatePrompts } from "./agents/prompt-loader";

// Validate all prompt templates exist before starting
validatePrompts();

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.route("/api", healthRoute);
app.route("/api", sessionRoute);
app.route("/api", generateRoute);

const port = Number(process.env.PORT) || 3001;
const wsHandler = createWSHandler();

const server = Bun.serve<WSData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId");
      const upgraded = server.upgrade(req, { data: { sessionId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Regular HTTP
    return app.fetch(req);
  },
  websocket: wsHandler,
});

console.log(`AVV API running on http://localhost:${port}`);
console.log(`WebSocket available at ws://localhost:${port}/ws`);
