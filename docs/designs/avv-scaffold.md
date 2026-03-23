# Scaffold AVV Monorepo

## Context

AVV (AI Visual Vibe Engineer) is a Figma-like web canvas where AI agents collaboratively generate UI mockups from prompts. This is the first design doc — it sets up the monorepo structure that all subsequent features build on.

The stack is: Turborepo + pnpm workspaces, Bun runtime, Hono backend, React + Vite + tldraw frontend, and shared TypeScript types. Based on the [bhvr](https://github.com/stevedylandev/bhvr) monorepo pattern.

## Requirements

- Monorepo with three packages: `web` (frontend), `api` (backend), `shared` (types)
- Single `pnpm dev` command starts both frontend and backend concurrently
- Shared TypeScript types importable from both `web` and `api` via `@avv/shared`
- Frontend: React 19 + Vite + tldraw (canvas library) + Tailwind CSS v4
- Backend: Bun + Hono with CORS enabled
- TypeScript strict mode across all packages
- Hot reload for both frontend and backend in dev mode

## Implementation

### Project structure

```
avv/
├── package.json              # Root: workspaces + turbo scripts
├── pnpm-workspace.yaml       # pnpm workspace config
├── turbo.json                # Turborepo pipeline config
├── tsconfig.json             # Root tsconfig (base)
├── .gitignore
├── packages/
│   ├── web/                  # React + Vite + tldraw frontend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── postcss.config.js
│   │   └── src/
│   │       ├── main.tsx          # React entry point
│   │       ├── App.tsx           # Root component — renders tldraw canvas
│   │       ├── app.css           # Tailwind imports + global styles
│   │       └── vite-env.d.ts     # Vite type declarations
│   ├── api/                  # Bun + Hono backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # Entry point — starts Hono server
│   │       ├── routes/
│   │       │   ├── index.ts      # Route barrel export
│   │       │   └── health.ts     # GET /health endpoint
│   │       └── ws.ts             # WebSocket upgrade handler (stub)
│   └── shared/               # Shared TypeScript types
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts          # Barrel export
│           └── types/
│               ├── index.ts      # Type barrel export
│               ├── api.ts        # API request/response types
│               ├── canvas.ts     # Canvas/shape types (used by both web and api)
│               └── ws.ts         # WebSocket message types
```

### Root package.json

File: `package.json`

```json
{
  "name": "avv",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "type-check": "turbo type-check",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.7"
  },
  "packageManager": "pnpm@9.15.0"
}
```

### pnpm-workspace.yaml

File: `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
```

### turbo.json

File: `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "persistent": true,
      "cache": false
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Root tsconfig.json

File: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### packages/shared/package.json

File: `packages/shared/package.json`

```json
{
  "name": "@avv/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

### packages/shared/tsconfig.json

File: `packages/shared/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### Shared types

File: `packages/shared/src/index.ts`

```typescript
export * from "./types";
```

File: `packages/shared/src/types/index.ts`

```typescript
export * from "./api";
export * from "./canvas";
export * from "./ws";
```

File: `packages/shared/src/types/api.ts`

```typescript
/** Standard API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** POST /api/generate request body */
export interface GenerateRequest {
  prompt: string;
  mode: "simple" | "ultrathink";
  sessionId?: string;
}

/** Session metadata */
export interface Session {
  id: string;
  prompt: string;
  mode: "simple" | "ultrathink";
  status: "idle" | "generating" | "done" | "error";
  createdAt: string;
}
```

File: `packages/shared/src/types/canvas.ts`

```typescript
/** Status of a component being generated */
export type ComponentStatus = "pending" | "generating" | "ready" | "error";

/** A UI component generated by an agent and rendered on the canvas */
export interface AVVComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  html: string;
  css: string;
  thumbnail?: string;
  prompt: string;
  agentId: string;
  iteration: number;
  width: number;
  height: number;
  x: number;
  y: number;
}
```

File: `packages/shared/src/types/ws.ts`

```typescript
import type { AVVComponent, ComponentStatus } from "./canvas";

/** Server -> Client WebSocket messages */
export type ServerMessage =
  | { type: "session:started"; sessionId: string }
  | { type: "component:created"; component: AVVComponent }
  | { type: "component:updated"; componentId: string; updates: Partial<AVVComponent> }
  | { type: "component:status"; componentId: string; status: ComponentStatus }
  | { type: "agent:log"; agentId: string; message: string }
  | { type: "generation:done"; sessionId: string }
  | { type: "error"; message: string };

/** Client -> Server WebSocket messages */
export type ClientMessage =
  | { type: "generate"; prompt: string; mode: "simple" | "ultrathink" }
  | { type: "iterate"; componentId: string; instruction: string }
  | { type: "cancel"; sessionId: string };
```

### packages/web/package.json

File: `packages/web/package.json`

```json
{
  "name": "@avv/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tldraw": "^2",
    "@avv/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4",
    "typescript": "^5.7",
    "vite": "^6"
  }
}
```

### packages/web/vite.config.ts

File: `packages/web/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
```

### packages/web/tsconfig.json

File: `packages/web/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

### packages/web/index.html

File: `packages/web/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AVV - AI Visual Vibe Engineer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### packages/web/src/main.tsx

File: `packages/web/src/main.tsx`

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

### packages/web/src/App.tsx

File: `packages/web/src/App.tsx`

```typescript
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw />
    </div>
  );
}
```

### packages/web/src/app.css

File: `packages/web/src/app.css`

```css
@import "tailwindcss";

html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

### packages/web/src/vite-env.d.ts

File: `packages/web/src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />
```

### packages/web/postcss.config.js

File: `packages/web/postcss.config.js`

```javascript
export default {};
```

### packages/api/package.json

File: `packages/api/package.json`

```json
{
  "name": "@avv/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "hono": "^4",
    "@avv/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.7"
  }
}
```

### packages/api/tsconfig.json

File: `packages/api/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

### packages/api/src/index.ts

File: `packages/api/src/index.ts`

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoute } from "./routes/health";

const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", logger());

// Routes
app.route("/api", healthRoute);

// Start server
const port = Number(process.env.PORT) || 3001;
console.log(`AVV API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
```

### packages/api/src/routes/index.ts

File: `packages/api/src/routes/index.ts`

```typescript
export { healthRoute } from "./health";
```

### packages/api/src/routes/health.ts

File: `packages/api/src/routes/health.ts`

```typescript
import { Hono } from "hono";
import type { ApiResponse } from "@avv/shared";

export const healthRoute = new Hono();

healthRoute.get("/health", (c) => {
  const response: ApiResponse<{ status: string }> = {
    success: true,
    data: { status: "ok" },
  };
  return c.json(response);
});
```

### packages/api/src/ws.ts

File: `packages/api/src/ws.ts`

```typescript
/**
 * WebSocket handler stub.
 * Will be implemented in design doc: avv-agent-canvas-bridge
 */
import type { ServerMessage, ClientMessage } from "@avv/shared";

export type { ServerMessage, ClientMessage };

// Placeholder — full implementation in avv-agent-canvas-bridge
export function handleWebSocketUpgrade() {
  // TODO: implement in avv-agent-canvas-bridge
}
```

### .gitignore

File: `.gitignore`

```
node_modules/
dist/
.turbo/
*.tsbuildinfo
.env
.env.local
```

## Testing Strategy

After scaffolding, verify with these commands from the repo root:

```bash
# Install dependencies
pnpm install

# Start dev servers (should start both web on :5173 and api on :3001)
pnpm dev

# In another terminal, verify API health
curl http://localhost:3001/api/health
# Expected: {"success":true,"data":{"status":"ok"}}

# Verify frontend loads at http://localhost:5173
# Expected: tldraw canvas fills the viewport

# Type check all packages
pnpm type-check
# Expected: no errors
```

## Out of Scope

- Custom tldraw shapes (covered in avv-canvas-core)
- WebSocket implementation (covered in avv-agent-canvas-bridge)
- Agent SDK integration (covered in avv-orchestrator-agent)
- Any UI beyond the bare tldraw canvas
- Authentication, database, or persistent storage
