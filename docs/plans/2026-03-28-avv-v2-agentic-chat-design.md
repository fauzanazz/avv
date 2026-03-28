# AVV v2 — Agentic Chat Platform Design

**Date:** 2026-03-28
**Status:** Approved
**Spec:** `.planning/spec.md`

## Design Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Migration approach | Clean slate in monorepo | Keep infra (Turborepo, Vite, WS), scrap domain code |
| AI backend | Claude Agent SDK (wraps Claude Code binary) | Full control, streaming, MCP tools |
| Sandbox | Deferred (no sandbox initially, add later) | AgentBox TS SDK not ready; unblocks chat + agent work |
| Agent collaboration | Orchestrator-driven | Dynamic delegation, iterative refinement |
| Persistence | SQLite + Drizzle ORM | Lightweight, file-based, no external deps |
| GitHub auth | Personal Access Token | Simple, no OAuth infrastructure |
| Preview | Tabbed (live iframe + file viewer) | Both interactive preview and code inspection |
| Smart routing | Orchestrator classifies intent | Design/build → prompt team; other → direct Claude |

## Architecture

### Data Flow

```
User Message
    │
    ▼
Smart Router (classifies intent)
    │
    ├── Design/Build request ──▶ Prompt Builder Orchestrator
    │                                  │
    │                           ┌──────┼──────┬──────────┬──────────┐
    │                           ▼      ▼      ▼          ▼          ▼
    │                        Design   UX    Animation  Artist   Typewriter
    │                        Engineer Engineer Engineer  Engineer
    │                           │      │      │          │          │
    │                           └──────┴──────┴──────────┴──────────┘
    │                                  │
    │                           Merged Comprehensive Prompt
    │                                  │
    │                           ┌──────▼──────┐
    │                           │ User Review  │ (edit/approve)
    │                           └──────┬──────┘
    │                                  │
    ├── Code/Chat request ─────────────┘
    │                                  │
    ▼                                  ▼
Claude Agent SDK (code generation, chat, tools)
    │
    ├── File operations → Preview Panel (file viewer)
    ├── Dev server → Preview Panel (live iframe)
    └── Streamed response → Chat Panel (messages, thinking, tool calls)
```

### Database Schema (SQLite + Drizzle)

```sql
-- Conversations
conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER,
  updated_at INTEGER
)

-- Messages within conversations
messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  role TEXT CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT,
  metadata TEXT, -- JSON: thinking steps, tool calls, agent activity
  created_at INTEGER
)

-- Generated prompts (persistent, reusable)
prompts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  title TEXT,
  content TEXT, -- The comprehensive prompt
  agents_output TEXT, -- JSON: each agent's contribution
  created_at INTEGER,
  updated_at INTEGER
)

-- Projects (generated codebases)
projects (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  prompt_id TEXT REFERENCES prompts(id),
  name TEXT,
  path TEXT, -- Local filesystem path
  github_repo TEXT, -- owner/repo if pushed
  created_at INTEGER
)

-- Settings
settings (
  key TEXT PRIMARY KEY,
  value TEXT -- JSON
)
```

### WebSocket Protocol v2

**Server → Client:**
```typescript
type ServerMessage =
  | { type: 'chat:text'; conversationId: string; content: string; streaming: boolean }
  | { type: 'chat:thinking'; conversationId: string; content: string }
  | { type: 'chat:tool_call'; conversationId: string; tool: string; args: any; result?: any }
  | { type: 'chat:done'; conversationId: string; messageId: string }
  | { type: 'chat:error'; conversationId: string; error: string }
  | { type: 'agent:activity'; agent: string; status: string; detail?: string }
  | { type: 'prompt:building'; agent: string; output: string }
  | { type: 'prompt:complete'; promptId: string; content: string; agentsOutput: Record<string, string> }
  | { type: 'file:changed'; path: string; content: string; action: 'created' | 'updated' | 'deleted' }
  | { type: 'file:tree'; files: FileEntry[] }
  | { type: 'preview:ready'; url: string }
  | { type: 'github:status'; status: string; repo?: string; error?: string }
  | { type: 'conversation:loaded'; conversation: Conversation; messages: Message[] }
  | { type: 'conversations:list'; conversations: ConversationSummary[] }
```

**Client → Server:**
```typescript
type ClientMessage =
  | { type: 'chat:send'; conversationId?: string; message: string }
  | { type: 'chat:cancel' }
  | { type: 'prompt:edit'; promptId: string; content: string }
  | { type: 'prompt:approve'; promptId: string }
  | { type: 'conversation:load'; conversationId: string }
  | { type: 'conversation:list' }
  | { type: 'conversation:new' }
  | { type: 'github:connect'; token: string }
  | { type: 'github:push'; projectId: string; repo?: string }
  | { type: 'settings:update'; key: string; value: any }
```

### Prompt Builder Agent Team

**Orchestrator** — lead agent that:
1. Analyzes user request
2. Decides which specialists to invoke and in what order
3. Synthesizes their outputs into a comprehensive prompt
4. Can iterate (send back to specialist if output needs refinement)

**Specialist Agents:**

| Agent | Domain | Tools | Output |
|-------|--------|-------|--------|
| Design Engineer | Design system | Frontend design skills, color theory, typography | Design tokens, theme, visual identity |
| UX Engineer | Layout & structure | Frontend design skills, component patterns | Page structure, component hierarchy, responsive behavior |
| Animation Engineer | Motion design | AOS docs, Three.js docs | Animation specs, transitions, interactions |
| Artist Engineer | Visual assets | Gemini image creation, 3D asset tools | Image descriptions, asset specs, placeholder references |
| Typewriter | Content & copy | Writing skills (TBD) | Headlines, body copy, CTAs, microcopy |

Each agent gets:
- A specialized system prompt defining their role and expertise
- Domain-specific tools (MCP or inline)
- Access to other agents' outputs (via orchestrator context)

### Frontend Component Tree

```
App
├── Sidebar
│   ├── ConversationList (history)
│   ├── NewChatButton
│   └── SettingsButton
├── ChatPanel (left)
│   ├── MessageList
│   │   ├── UserMessage
│   │   ├── AssistantMessage
│   │   │   ├── ThinkingStep
│   │   │   ├── ToolCallStep
│   │   │   ├── AgentActivityStep
│   │   │   └── TextContent
│   │   └── PromptReviewMessage
│   │       ├── AgentContributions (collapsible)
│   │       ├── PromptEditor
│   │       └── ApproveButton
│   └── ChatInput
│       ├── TextArea
│       └── SendButton
├── PreviewPanel (right, tabbed)
│   ├── PreviewTab (live iframe)
│   └── FilesTab
│       ├── FileTree
│       └── CodeViewer (syntax highlighted)
└── SettingsModal
    ├── GitHubPATInput
    └── Preferences
```
