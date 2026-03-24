# Create AGENTS.md

## Context

AVV needs an AGENTS.md so that coding agents working on the repo understand the project structure, conventions, tech stack, and patterns. This is especially important because AVV is a multi-package monorepo with a unique architecture (tldraw canvas + Claude Agent SDK + WebSocket streaming).

## Requirements

- AGENTS.md at the repo root covering: project overview, structure, tech stack, conventions, testing
- Must reflect the current architecture (component-based canvas model, UltraThink questionnaire, prompt bar + canvas layout)
- Must document the prompt template system and how to add new agent roles
- Must document the WebSocket message protocol

## Implementation

### AGENTS.md

File: `AGENTS.md`

```markdown
# AGENTS.md — AVV (AI Visual Vibe Engineer)

## Project Overview

AVV is a Figma-like web canvas where AI agents collaboratively generate UI mockups from prompts. Users describe a page in natural language, an enricher agent refines the prompt, an orchestrator decomposes it into components, parallel builder agents generate each component's HTML/CSS, and the results render as tldraw shapes on an infinite canvas.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | React 19 + Vite + tldraw (canvas SDK) + Tailwind CSS v4 |
| Backend | Bun runtime + Hono framework |
| Agent SDK | @anthropic-ai/claude-agent-sdk (TypeScript) |
| Real-time | WebSocket (Bun native) |
| Types | Shared via @avv/shared package |

## Project Structure

\`\`\`
avv/
├── packages/
│   ├── web/                     # React frontend
│   │   ├── src/
│   │   │   ├── App.tsx              # Root — full-screen layout with tldraw canvas
│   │   │   ├── canvas/
│   │   │   │   ├── shapes/
│   │   │   │   │   └── avv-component/  # Custom tldraw shape (individual component)
│   │   │   │   └── hooks/           # Canvas-specific hooks
│   │   │   ├── components/          # PromptBar, StatusBar, LayersPanel, PropertiesPanel, ChatPanel
│   │   │   └── hooks/               # WebSocket, canvas sync, agent logs
│   │   └── vite.config.ts
│   ├── api/                     # Bun + Hono backend
│   │   ├── src/
│   │   │   ├── index.ts             # Server entry + WebSocket upgrade
│   │   │   ├── ws.ts                # WebSocket message handler
│   │   │   ├── agents/
│   │   │   │   ├── orchestrator.ts  # Decomposes prompt into ComponentPlan[], spawns builders
│   │   │   │   ├── enricher.ts     # Enriches raw prompt with UI/UX best practices
│   │   │   │   ├── ultrathink.ts   # Multi-turn questionnaire before generation
│   │   │   │   ├── iterator.ts     # Refines a single component via right-click instruction
│   │   │   │   ├── image-queue.ts  # Async image generation queue
│   │   │   │   ├── component-collector.ts # Extracts HTML/CSS from SDK message stream
│   │   │   │   ├── prompt-loader.ts # Loads .md prompt templates
│   │   │   │   └── tools/           # MCP tools for builder agents
│   │   │   ├── routes/              # REST endpoints (health, session, generate)
│   │   │   └── store/               # In-memory session + connection stores
│   │   └── prompts/             # System prompt templates (.md files)
│   │       ├── orchestrator.md
│   │       ├── builder.md
│   │       ├── enricher.md
│   │       └── ultrathink.md
│   └── shared/                  # Shared TypeScript types
│       └── src/types/
│           ├── canvas.ts            # AVVComponent, ComponentStatus
│           ├── agent.ts             # ComponentPlan, DesignPlan, ImageRequest, ImageResult
│           ├── ws.ts                # ServerMessage, ClientMessage unions
│           └── api.ts               # REST API types
├── turbo.json
├── pnpm-workspace.yaml
└── AGENTS.md                    # This file
\`\`\`

## Key Architecture Patterns

### Data Model: Independent Components

Each UI component is an independent tldraw shape on the canvas with its own HTML, CSS, position, and dimensions. Components are not nested — they are top-level shapes placed at absolute coordinates.

\`\`\`
Canvas
  ├── AVVComponentShape { name: "Navigation", html: "...", css: "...", status: "ready" }
  ├── AVVComponentShape { name: "Hero", html: "...", css: "...", status: "generating" }
  └── AVVComponentShape { name: "Features", html: "...", css: "...", status: "pending" }
\`\`\`

The \`AVVComponent\` type (in \`@avv/shared\`) carries: \`id\`, \`name\`, \`status\`, \`html\`, \`css\`, \`prompt\`, \`agentId\`, \`iteration\`, \`width\`, \`height\`, \`x\`, \`y\`.

### Agent Flow

\`\`\`
User prompt
  → Enricher Agent (simple mode: adds UI/UX best practices to prompt)
  → Orchestrator Agent (decomposes into ComponentPlan[])
  → Builder Subagents (parallel, one per component, generate HTML/CSS via MCP tools)
  → WebSocket → Canvas (components appear in real-time)
\`\`\`

**UltraThink mode** inserts a questionnaire step before orchestration:
\`\`\`
User prompt
  → UltraThink Agent (asks clarifying questions via WebSocket)
  → User answers questions in ChatPanel
  → Enriched prompt
  → Orchestrator → Builders → Canvas
\`\`\`

### WebSocket Protocol

All real-time communication uses typed messages defined in \`@avv/shared\`:
- **Server → Client**: \`session:started\`, \`component:created\`, \`component:updated\`, \`component:status\`, \`agent:log\`, \`generation:done\`, \`image:ready\`, \`image:generating\`, \`ultrathink:question\`, \`ultrathink:spec\`, \`ultrathink:ready\`, \`error\`
- **Client → Server**: \`generate\`, \`iterate\`, \`ultrathink:answer\`, \`ultrathink:confirm\`, \`cancel\`

### Prompt Templates

Agent system prompts live in \`packages/api/prompts/*.md\`. They are loaded by \`prompt-loader.ts\` and cached. To add a new agent role:
1. Create \`packages/api/prompts/{role}.md\`
2. Add the role name to \`REQUIRED_PROMPTS\` in \`prompt-loader.ts\`
3. Load it with \`loadPrompt("{role}")\` in your agent code

## Coding Conventions

### General
- TypeScript strict mode everywhere
- Use \`pnpm\` for package management (never npm/yarn)
- Use \`bun\` runtime for the API server
- Imports: prefer \`@avv/shared\` for shared types
- No \`any\` types — use \`unknown\` and narrow

### Frontend (packages/web)
- React functional components only
- Custom hooks in \`hooks/\` directory
- tldraw shapes in \`canvas/shapes/{shape-name}/\` with barrel exports
- UI components in \`components/\`
- Use Tailwind CSS classes (not inline styles, except in tldraw shape components where inline is required)
- Font stack: Inter (body), Noto Serif (headings/branding), Public Sans (labels)
- Icons: Material Symbols Outlined via Google Fonts CDN

### Backend (packages/api)
- Hono for HTTP routes in \`routes/\` directory
- Bun native WebSocket (not hono/ws)
- Agent code in \`agents/\` directory
- MCP tools in \`agents/tools/\`
- Use \`connectionStore.broadcast()\` for WebSocket messaging
- All agent SDK calls use \`query()\` from \`@anthropic-ai/claude-agent-sdk\`

### Shared Types (packages/shared)
- All types that cross the web/api boundary go here
- Barrel export from \`src/index.ts\`
- WebSocket message types are discriminated unions on the \`type\` field

## Commands

\`\`\`bash
pnpm install          # Install all dependencies
pnpm dev              # Start both web (5173) and api (3001) dev servers
pnpm build            # Build all packages
pnpm type-check       # TypeScript check across all packages
\`\`\`

## Testing

- Backend tests: \`cd packages/api && bun test\`
- Test files live alongside source: \`*.test.ts\`
- Smoke test: \`curl http://localhost:3001/api/health\`
- WebSocket test: connect to \`ws://localhost:3001/ws\` and send \`{"type":"generate","prompt":"test","mode":"simple"}\`
\`\`\`
```

## Testing Strategy

```bash
# Verify AGENTS.md is readable and accurate:
# 1. Check that all referenced file paths exist
# 2. Check that all referenced commands work (pnpm dev, pnpm type-check)
# 3. Verify the architecture description matches the actual code
```

## Out of Scope

- Contributing guide
- CI/CD documentation
- Deployment instructions
