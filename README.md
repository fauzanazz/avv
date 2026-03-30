# AVV - AI Visual Vibe Engineer

AVV is an agentic chat IDE for building web applications with AI. Describe what you want to build, and a team of specialized AI agents — design, UX, animation, art, and copy — collaborates to generate a full React + Vite project with instant live preview.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9
- [Bun](https://bun.sh/) >= 1.0
- `ANTHROPIC_API_KEY` environment variable set

## Setup

```bash
# Install dependencies
pnpm install

# Build shared types (required before first run)
pnpm build

# Copy and configure environment
cp .env.example .env
```

## Development

```bash
# Start both API and web dev servers
pnpm dev
```

This starts:
- **Web** at `http://localhost:5173` (Vite + React)
- **API** at `http://localhost:3001` (Bun + Hono + WebSocket)

The Vite dev server proxies `/api`, `/ws`, and `/preview` to the API server automatically.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers (Turborepo) |
| `pnpm build` | Build all packages |
| `pnpm type-check` | TypeScript type checking |
| `pnpm smoke` | Run smoke test (install, build, type-check) |
| `pnpm clean` | Remove build artifacts |

## Project Structure

```
avv/
├── packages/
│   ├── web/              # React 19 + Vite 6 frontend
│   │   └── src/
│   │       ├── pages/                     # ConversationsPage, ChatPage
│   │       ├── components/
│   │       │   ├── chat/                  # MessageList, ChatInput, PromptCard, ToolCalls, Thinking
│   │       │   └── preview/               # Live iframe preview + file tree + code viewer
│   │       └── hooks/                     # useChat, useAVVWebSocket, useSmartScroll
│   ├── api/              # Bun + Hono backend
│   │   └── src/
│   │       ├── chat/
│   │       │   ├── agent.ts               # Claude Agent SDK wrapper
│   │       │   ├── prompt-builder.ts      # Runs 5 specialist agents in parallel
│   │       │   ├── router.ts              # Classifies intent (build vs chat)
│   │       │   ├── conversation-manager.ts
│   │       │   ├── sandbox-manager.ts     # AgentBox sandbox lifecycle
│   │       │   ├── dev-server.ts          # Local Vite dev server per conversation
│   │       │   └── scaffolder.ts          # Project scaffolding (Vite + React template)
│   │       ├── db/                        # SQLite + Drizzle ORM
│   │       ├── storage/                   # R2 (prod) or local filesystem (dev)
│   │       ├── github/                    # GitHub PAT auth + repo push
│   │       ├── prompts/                   # Agent prompt templates (specialists + skills)
│   │       └── ws.ts                      # WebSocket message router
│   └── shared/           # Shared TypeScript types (@avv/shared)
│       └── src/types/                     # WebSocket protocol, conversation, files, project
├── docs/
│   ├── plans/                             # Architecture & design plans
│   └── designs/                           # Detailed design documents
├── turbo.json
└── package.json
```

## How It Works

1. **User sends a message** in the chat interface
2. **Smart Router** classifies the intent as "build" (new app/design) or "chat" (conversation/debugging)
3. **Build requests** go through the Prompt Builder — 5 specialist agents run in parallel:
   - **Design Engineer** — design tokens, colors, typography
   - **UX Engineer** — layout, components, responsive structure
   - **Animation Engineer** — Framer Motion specs
   - **Artist Engineer** — images, assets, SVG specs
   - **Typewriter** — headlines, copy, microcopy
4. The **Orchestrator** merges specialist outputs into a comprehensive prompt
5. User reviews and optionally edits the merged prompt, then approves
6. **Claude Agent SDK** generates a full React + Vite project, streaming code in real time
7. A **live preview** appears in the right panel alongside a file tree browser
8. Users can continue chatting to **iterate** on the generated code

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude |
| `PORT` | No | API server port (default: 3001) |
| `NODE_ENV` | No | `development` or `production` |
| `AGENTBOX_URL` | No | AgentBox sandbox URL (for isolated execution) |
| `R2_ENDPOINT` | Prod | Cloudflare R2 storage endpoint |
| `R2_ACCESS_KEY_ID` | Prod | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Prod | R2 secret key |
| `R2_BUCKET` | Prod | R2 bucket name |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 6, React Router 7, Tailwind CSS v4 |
| Backend | Bun, Hono v4, Bun native WebSocket |
| AI | Claude Agent SDK (@anthropic-ai/claude-agent-sdk) |
| Database | SQLite + Drizzle ORM |
| Storage | Cloudflare R2 (prod), local filesystem (dev) |
| Sandbox | AgentBox (optional, isolated VM execution) |
| Generated Projects | React 19, Framer Motion, Lucide React, Tailwind v4 |
