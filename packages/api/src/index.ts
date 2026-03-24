import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoute } from "./routes/health";
import { sessionRoute } from "./routes/session";
import { generateRoute } from "./routes/generate";
import { createWSHandler } from "./ws";
<<<<<<< HEAD
import type { WSData } from "./store";
import { validatePrompts } from "./agents/prompt-loader";
=======
>>>>>>> 72ce0f7 (feat: add backend API infrastructure with session store, connection store, routes, and WebSocket handler [FAU-36])

// Validate all prompt templates exist before starting
validatePrompts();

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.route("/api", healthRoute);
app.route("/api", sessionRoute);
app.route("/api", generateRoute);

<<<<<<< HEAD
const parsed = Number(process.env.PORT);
const port = Number.isNaN(parsed) ? 3001 : parsed;
const wsHandler = createWSHandler();

const server = Bun.serve<WSData>({
=======
const port = Number(process.env.PORT) || 3001;
const wsHandler = createWSHandler();

const server = Bun.serve({
>>>>>>> 72ce0f7 (feat: add backend API infrastructure with session store, connection store, routes, and WebSocket handler [FAU-36])
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
