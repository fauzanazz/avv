# AGENTS.md — AVV (AI Visual Vibe Engineer)

## Project Overview

AVV is a Figma-like web canvas where AI agents collaboratively generate UI mockups from prompts. Users describe a page in natural language, an enricher agent refines the prompt, an orchestrator decomposes it into components, parallel builder agents generate each component's HTML/CSS, and the results render as tldraw shapes on an infinite canvas.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | React 19 + Vite 6 + tldraw v2 (canvas SDK) + Tailwind CSS v4 |
| Backend | Bun runtime + Hono v4 framework |
| Agent SDK | @anthropic-ai/claude-agent-sdk (TypeScript) |
| Real-time | WebSocket (Bun native) |
| Validation | Zod v4 |
| Types | Shared via @avv/shared package |

## Project Structure

```
avv/
├── packages/
│   ├── web/                         # React frontend (@avv/web)
│   │   ├── src/
│   │   │   ├── App.tsx                  # Root — full-screen layout with tldraw canvas
│   │   │   ├── main.tsx                 # Vite entry point
│   │   │   ├── canvas/
│   │   │   │   ├── shapes.ts            # Shape registration barrel
│   │   │   │   ├── shapes/
│   │   │   │   │   └── avv-component/   # Custom tldraw shape (individual component)
│   │   │   │   │       ├── AVVComponentShapeUtil.tsx
│   │   │   │   │       ├── ComponentPreview.tsx
│   │   │   │   │       ├── ComponentStatusOverlay.tsx
│   │   │   │   │       ├── avv-component-types.ts
│   │   │   │   │       └── index.ts
│   │   │   │   └── hooks/
│   │   │   │       ├── useImagePatching.ts
│   │   │   │       └── useComponentContextMenu.ts
│   │   │   ├── components/
│   │   │   │   ├── PromptBar.tsx        # Top prompt input bar
│   │   │   │   ├── StatusBar.tsx        # Bottom status/log bar
│   │   │   │   ├── LayersPanel.tsx      # Left panel — component layers
│   │   │   │   ├── PropertiesPanel.tsx  # Right panel — component properties
│   │   │   │   ├── ChatPanel.tsx        # UltraThink questionnaire panel
│   │   │   │   ├── ComponentContextMenu.tsx  # Right-click iteration menu
│   │   │   │   └── index.ts
│   │   │   └── hooks/
│   │   │       ├── useAVVWebSocket.ts   # WebSocket connection + auto-reconnect
│   │   │       ├── useCanvasSync.ts     # Maps server messages to tldraw shapes
│   │   │       ├── useAgentLogs.ts      # Collects agent:log messages
│   │   │       └── index.ts
│   │   └── vite.config.ts              # Dev server on :5173, proxies /api and /ws to :3001
│   ├── api/                         # Bun + Hono backend (@avv/api)
│   │   ├── src/
│   │   │   ├── index.ts                 # Server entry + WebSocket upgrade
│   │   │   ├── ws.ts                    # WebSocket message handler + UltraThink flow
│   │   │   ├── agents/
│   │   │   │   ├── orchestrator.ts      # Decomposes prompt into ComponentPlan[], spawns builders
│   │   │   │   ├── enricher.ts          # Enriches raw prompt with UI/UX best practices
│   │   │   │   ├── iterator.ts          # Refines a single component via right-click instruction
│   │   │   │   ├── ultrathink.ts        # Multi-turn questionnaire before generation
│   │   │   │   ├── image-queue.ts       # Async image generation queue
│   │   │   │   ├── component-collector.ts  # Extracts HTML/CSS from SDK message stream
│   │   │   │   ├── prompt-loader.ts     # Loads + caches .md prompt templates
│   │   │   │   ├── index.ts
│   │   │   │   └── tools/
│   │   │   │       ├── submit-component.ts  # MCP tool: builder submits HTML/CSS
│   │   │   │       ├── request-image.ts     # MCP tool: builder requests image generation
│   │   │   │       └── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── health.ts            # GET /api/health
│   │   │   │   ├── session.ts           # Session management endpoints
│   │   │   │   ├── generate.ts          # POST /api/generate
│   │   │   │   └── index.ts
│   │   │   └── store/
│   │   │       ├── connection-store.ts  # WebSocket connection tracking + broadcast
│   │   │       ├── session-store.ts     # In-memory session state
│   │   │       └── index.ts
│   │   ├── tests/                   # Additional test files
│   │   │   ├── component-collector.test.ts
│   │   │   └── submit-component.test.ts
│   │   └── prompts/                 # System prompt templates (.md files)
│   │       ├── orchestrator.md
│   │       ├── builder.md
│   │       ├── enricher.md
│   │       └── ultrathink.md
│   └── shared/                      # Shared TypeScript types (@avv/shared)
│       └── src/
│           ├── index.ts                 # Barrel re-export
│           └── types/
│               ├── canvas.ts            # AVVComponent, ComponentStatus
│               ├── agent.ts             # ComponentPlan, DesignPlan, ImageRequest, ImageResult
│               ├── ws.ts                # ServerMessage, ClientMessage unions
│               ├── api.ts              # REST API types (ApiResponse, GenerateRequest, Session)
│               └── index.ts
├── scripts/
│   └── smoke-test.sh
├── turbo.json
├── pnpm-workspace.yaml
└── AGENTS.md                        # This file
```

## Key Architecture Patterns

### Data Model: Independent Components

Each UI component is an independent tldraw shape on the canvas with its own HTML, CSS, position, and dimensions. Components are not nested — they are top-level shapes placed at absolute coordinates.

```
Canvas
  ├── AVVComponentShape { name: "Navigation", html: "...", css: "...", status: "ready" }
  ├── AVVComponentShape { name: "Hero", html: "...", css: "...", status: "generating" }
  └── AVVComponentShape { name: "Features", html: "...", css: "...", status: "pending" }
```

The `AVVComponent` type (in `@avv/shared`) carries: `id`, `name`, `status`, `html`, `css`, `prompt`, `agentId`, `iteration`, `width`, `height`, `x`, `y`. The tldraw shape (`AVVComponentShape`) mirrors these as shape props.

### Agent Flow

```
User prompt
  → Enricher Agent (simple mode: adds UI/UX best practices to prompt)
  → Orchestrator Agent (decomposes into ComponentPlan[])
  → Builder Subagents (parallel, one per component, generate HTML/CSS via MCP tools)
  → WebSocket → Canvas (components appear in real-time)
```

**UltraThink mode** inserts a questionnaire step before orchestration:
```
User prompt
  → UltraThink Agent (asks clarifying questions via WebSocket)
  → User answers questions in ChatPanel
  → Enriched prompt
  → Orchestrator → Builders → Canvas
```

**Iteration** (right-click a component):
```
User instruction + current HTML/CSS
  → Iterator Agent (spawns builder subagent with current code + instruction)
  → Updated component via WebSocket
```

### WebSocket Protocol

All real-time communication uses typed discriminated unions defined in `@avv/shared`:

**Server → Client** (`ServerMessage`):
- `session:started` — session created, includes sessionId
- `component:created` — new component placeholder on canvas
- `component:updated` — updated HTML/CSS/status for a component
- `component:status` — status-only update (pending/generating/ready/error)
- `agent:log` — log message from an agent
- `generation:done` — all builders finished
- `image:ready` — generated image data URI
- `image:generating` — image generation in progress
- `ultrathink:question` — UltraThink asks user a question
- `ultrathink:spec` — UltraThink generated spec
- `ultrathink:ready` — UltraThink enriched prompt ready
- `error` — error message

**Client → Server** (`ClientMessage`):
- `generate` — start generation (includes prompt + mode: "simple" | "ultrathink")
- `iterate` — refine a specific component (includes componentId, current HTML/CSS, instruction)
- `ultrathink:answer` — answer to a UltraThink question
- `ultrathink:confirm` — confirm all UltraThink answers, proceed to generation
- `cancel` — abort current generation

### Prompt Templates

Agent system prompts live in `packages/api/prompts/*.md`. They are loaded by `prompt-loader.ts` and cached in memory.

**Required prompts** (validated at server startup): `orchestrator`, `builder`, `enricher`, `ultrathink`

To add a new agent role:
1. Create `packages/api/prompts/{role}.md`
2. Add the role name to the `REQUIRED_PROMPTS` tuple in `packages/api/src/agents/prompt-loader.ts`
3. Load it with `loadPrompt("{role}")` in your agent code

### MCP Tools

Builder agents interact with the system through MCP tools registered via `createSdkMcpServer`:
- `submit_component` — builder submits generated HTML and CSS
- `request_image` — builder requests an AI-generated image (returns placeholder, resolved async)

## Coding Conventions

### General
- TypeScript strict mode everywhere
- Use `pnpm` for package management (never npm/yarn)
- Use `bun` runtime for the API server
- Imports: prefer `@avv/shared` for shared types
- No `any` types — use `unknown` and narrow

### Frontend (packages/web)
- React 19 functional components only
- Custom hooks in `hooks/` directory, canvas-specific hooks in `canvas/hooks/`
- tldraw shapes in `canvas/shapes/{shape-name}/` with barrel exports
- UI components in `components/`
- Use Tailwind CSS classes (not inline styles, except in tldraw shape components where inline is required)
- Vite dev server on port 5173 with proxy to API on port 3001

### Backend (packages/api)
- Hono for HTTP routes in `routes/` directory
- Bun native WebSocket (not hono/ws) — upgrade happens in `src/index.ts`
- Agent code in `agents/` directory
- MCP tools in `agents/tools/`
- Use `connectionStore.broadcast(sessionId, msg)` for WebSocket messaging to all session clients
- Use `connectionStore.send(ws, msg)` for single-client messaging
- All agent SDK calls use `query()` from `@anthropic-ai/claude-agent-sdk`
- Subagents use `AgentDefinition` objects passed to `query()` via `options.agents`

### Shared Types (packages/shared)
- All types that cross the web/api boundary go here
- Barrel export from `src/index.ts` → `src/types/index.ts`
- WebSocket message types are discriminated unions on the `type` field
- Canvas types: `AVVComponent`, `ComponentStatus`
- Agent types: `ComponentPlan`, `DesignPlan`, `ImageRequest`, `ImageResult`
- API types: `ApiResponse<T>`, `GenerateRequest`, `Session`

## Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start both web (5173) and api (3001) dev servers
pnpm build            # Build all packages
pnpm type-check       # TypeScript check across all packages
```

## Testing

- Backend tests: `cd packages/api && bun test`
- Test files: co-located as `*.test.ts` (both in `src/agents/` and `tests/`)
- Smoke test: `bash scripts/smoke-test.sh` or `pnpm smoke`
- Health check: `curl http://localhost:3001/api/health`
- WebSocket test: connect to `ws://localhost:3001/ws` and send `{"type":"generate","prompt":"test","mode":"simple"}`
