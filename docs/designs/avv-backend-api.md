# AVV Backend API — Hono Server with WebSocket

## Context

With the monorepo scaffolded (FAU-33), this doc implements the backend API server. The server manages generation sessions and provides a WebSocket endpoint for real-time communication between the agent layer and the frontend canvas. Agents stream component updates through WebSocket to the client.

## Requirements

- HTTP REST endpoints: health check, session CRUD, generate trigger
- WebSocket endpoint at `/ws` for real-time agent-to-canvas communication
- In-memory session store (no database for V1)
- Type-safe WebSocket messages using `@avv/shared` types
- Clean route organization with Hono router groups

## Implementation

### Updated entry point with WebSocket

File: `packages/api/src/index.ts` (replace existing)

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoute } from "./routes/health";
import { sessionRoute } from "./routes/session";
import { generateRoute } from "./routes/generate";
import { createWSHandler } from "./ws";

const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", logger());

// REST routes
app.route("/api", healthRoute);
app.route("/api", sessionRoute);
app.route("/api", generateRoute);

const port = Number(process.env.PORT) || 3001;
const wsHandler = createWSHandler();

const server = Bun.serve({
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
```

### Session store

File: `packages/api/src/store/session-store.ts`

```typescript
import type { Session } from "@avv/shared";

/**
 * In-memory session store for V1.
 * Maps session IDs to session metadata.
 */
class SessionStore {
  private sessions = new Map<string, Session>();

  create(prompt: string, mode: "simple" | "ultrathink"): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      prompt,
      mode,
      status: "idle",
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  update(id: string, updates: Partial<Omit<Session, "id">>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.sessions.set(id, updated);
    return updated;
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }
}

export const sessionStore = new SessionStore();
```

### WebSocket connection manager

File: `packages/api/src/store/connection-store.ts`

```typescript
import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "@avv/shared";

export interface WSData {
  sessionId: string | null;
}

/**
 * Manages WebSocket connections per session.
 * When an agent produces a component update, we broadcast to all
 * clients watching that session.
 */
class ConnectionStore {
  /** sessionId -> set of connected WebSockets */
  private connections = new Map<string, Set<ServerWebSocket<WSData>>>();

  add(sessionId: string, ws: ServerWebSocket<WSData>): void {
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(ws);
  }

  remove(ws: ServerWebSocket<WSData>): void {
    for (const [sessionId, sockets] of this.connections) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.connections.delete(sessionId);
      }
    }
  }

  /** Broadcast a message to all clients watching a session */
  broadcast(sessionId: string, message: ServerMessage): void {
    const sockets = this.connections.get(sessionId);
    if (!sockets) return;
    const payload = JSON.stringify(message);
    for (const ws of sockets) {
      ws.send(payload);
    }
  }

  /** Send a message to a specific WebSocket */
  send(ws: ServerWebSocket<WSData>, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }
}

export const connectionStore = new ConnectionStore();
```

### Store barrel export

File: `packages/api/src/store/index.ts`

```typescript
export { sessionStore } from "./session-store";
export { connectionStore } from "./connection-store";
export type { WSData } from "./connection-store";
```

### WebSocket handler

File: `packages/api/src/ws.ts` (replace existing)

```typescript
import type { ServerWebSocket } from "bun";
import type { ClientMessage } from "@avv/shared";
import { connectionStore, type WSData } from "./store";

/**
 * Creates Bun WebSocket handlers.
 * Client connects with ?sessionId=xxx to subscribe to a session's updates.
 */
export function createWSHandler() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      const { sessionId } = ws.data;
      console.log(`[WS] Client connected (session: ${sessionId ?? "none"})`);

      if (sessionId) {
        connectionStore.add(sessionId, ws);
        connectionStore.send(ws, {
          type: "session:started",
          sessionId,
        });
      }
    },

    message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
      try {
        const msg: ClientMessage = JSON.parse(
          typeof raw === "string" ? raw : raw.toString()
        );
        handleClientMessage(ws, msg);
      } catch (err) {
        connectionStore.send(ws, {
          type: "error",
          message: "Invalid message format",
        });
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      console.log("[WS] Client disconnected");
      connectionStore.remove(ws);
    },
  };
}

function handleClientMessage(ws: ServerWebSocket<WSData>, msg: ClientMessage): void {
  switch (msg.type) {
    case "generate":
      // Will be implemented in avv-orchestrator-agent
      console.log(`[WS] Generate request: ${msg.prompt} (mode: ${msg.mode})`);
      break;
    case "iterate":
      // Will be implemented in avv-component-iteration
      console.log(`[WS] Iterate request: ${msg.componentId}`);
      break;
    case "cancel":
      console.log(`[WS] Cancel request: ${msg.sessionId}`);
      break;
  }
}
```

### Session REST route

File: `packages/api/src/routes/session.ts`

```typescript
import { Hono } from "hono";
import type { ApiResponse, Session } from "@avv/shared";
import { sessionStore } from "../store";

export const sessionRoute = new Hono();

/** GET /api/sessions — list all sessions */
sessionRoute.get("/sessions", (c) => {
  const sessions = sessionStore.list();
  const response: ApiResponse<Session[]> = { success: true, data: sessions };
  return c.json(response);
});

/** GET /api/sessions/:id — get a single session */
sessionRoute.get("/sessions/:id", (c) => {
  const session = sessionStore.get(c.req.param("id"));
  if (!session) {
    return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true, data: session } satisfies ApiResponse<Session>);
});

/** DELETE /api/sessions/:id — delete a session */
sessionRoute.delete("/sessions/:id", (c) => {
  const deleted = sessionStore.delete(c.req.param("id"));
  if (!deleted) {
    return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true } satisfies ApiResponse);
});
```

### Generate REST route

File: `packages/api/src/routes/generate.ts`

```typescript
import { Hono } from "hono";
import type { ApiResponse, GenerateRequest, Session } from "@avv/shared";
import { sessionStore } from "../store";

export const generateRoute = new Hono();

/**
 * POST /api/generate — start a generation session.
 * Creates a session and returns its ID. The actual agent work
 * will be triggered via WebSocket or this endpoint in avv-orchestrator-agent.
 */
generateRoute.post("/generate", async (c) => {
  const body = await c.req.json<GenerateRequest>();

  if (!body.prompt || !body.mode) {
    return c.json(
      { success: false, error: "prompt and mode are required" } satisfies ApiResponse,
      400
    );
  }

  if (body.mode !== "simple" && body.mode !== "ultrathink") {
    return c.json(
      { success: false, error: "mode must be 'simple' or 'ultrathink'" } satisfies ApiResponse,
      400
    );
  }

  const session = sessionStore.create(body.prompt, body.mode);
  const response: ApiResponse<Session> = { success: true, data: session };
  return c.json(response, 201);
});
```

### Updated routes barrel export

File: `packages/api/src/routes/index.ts` (replace existing)

```typescript
export { healthRoute } from "./health";
export { sessionRoute } from "./session";
export { generateRoute } from "./generate";
```

## Testing Strategy

```bash
# Start API
cd packages/api && bun run dev

# Test health endpoint
curl http://localhost:3001/api/health
# Expected: {"success":true,"data":{"status":"ok"}}

# Test session creation
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Landing page for SaaS","mode":"simple"}'
# Expected: {"success":true,"data":{"id":"<uuid>","prompt":"Landing page for SaaS","mode":"simple","status":"idle","createdAt":"..."}}

# Test session listing
curl http://localhost:3001/api/sessions
# Expected: {"success":true,"data":[...sessions]}

# Test WebSocket (using websocat or wscat)
# wscat -c ws://localhost:3001/ws?sessionId=<uuid>
# Expected: receives {"type":"session:started","sessionId":"<uuid>"}

# Type check
pnpm type-check
```

## Out of Scope

- Agent orchestration logic (avv-orchestrator-agent)
- Component iteration handling (avv-component-iteration)
- Authentication or rate limiting
- Database persistence (in-memory only for V1)
- File upload or image storage
