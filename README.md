# AVV - AI Visual Vibe Engineer

AVV is an AI-powered visual design tool that generates UI components on an infinite canvas. Describe what you want, and AI agents decompose your prompt into components, generate HTML/CSS, and render live previews — all in real time via WebSocket.

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

# Run the smoke test to verify everything works
pnpm smoke
```

## Development

```bash
# Start both API and web dev servers
pnpm dev
```

This starts:
- **Web** at `http://localhost:5173` (Vite + React + tldraw)
- **API** at `http://localhost:3001` (Bun + Hono + WebSocket)

The Vite dev server proxies `/api` and `/ws` to the API server automatically.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers (Turborepo) |
| `pnpm build` | Build all packages |
| `pnpm type-check` | TypeScript type checking |
| `pnpm smoke` | Run smoke test (install, build, type-check, tests) |
| `pnpm clean` | Remove build artifacts |

## Project Structure

```
avv/
├── packages/
│   ├── web/          # React frontend with tldraw canvas
│   │   └── src/
│   │       ├── App.tsx                    # Main app (all hooks + panels wired)
│   │       ├── canvas/
│   │       │   ├── shapes/               # Custom tldraw shape (AVV component)
│   │       │   └── hooks/                # Canvas-specific hooks
│   │       ├── components/               # UI panels (PromptBar, Layers, Properties, Chat, ContextMenu)
│   │       └── hooks/                    # App-level hooks (WebSocket, canvas sync, agent logs)
│   ├── api/          # Bun + Hono backend
│   │   └── src/
│   │       ├── agents/                   # AI agent pipeline (orchestrator, builder, enricher, ultrathink, iterator)
│   │       ├── routes/                   # REST endpoints
│   │       ├── store/                    # In-memory session + connection stores
│   │       └── ws.ts                     # WebSocket handler
│   └── shared/       # Shared TypeScript types
│       └── src/types/                    # API, canvas, WebSocket, and agent types
├── scripts/
│   └── smoke-test.sh
├── turbo.json
└── package.json
```

## How It Works

1. **User enters a prompt** in the PromptBar (Simple or UltraThink mode)
2. **Simple mode**: The enricher agent enhances the prompt, then the orchestrator decomposes it into components
3. **UltraThink mode**: Asks clarifying questions first, generates a design spec, then orchestrates
4. **Builder subagents** run in parallel, each generating HTML/CSS for one component
5. **Components appear on the tldraw canvas** in real time as they're generated
6. **Right-click any component** to iterate on it with natural language instructions
7. **Image generation** runs asynchronously — placeholders are shown until real images arrive

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude |
| `PORT` | No | API server port (default: 3001) |
