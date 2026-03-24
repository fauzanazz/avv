# Agentic Chat + Error Retry

## Context

This combined doc covers two backend features that share `ws.ts` and the agent layer. It supersedes FAU-47 (agentic chat) and FAU-63 (error retry).

1. **Agentic Chat** — Replace the linear enricher/ultrathink flow with a multi-turn conversation agent that streams thinking, proposes design options with inline previews, and iterates with the user
2. **Error Retry** — Section-level retry for failed builder agents without re-generating the entire page

## Requirements

### Agentic Chat
- Single conversation agent replaces both enricher and ultrathink modules
- Agent streams thinking blocks, option proposals with HTML previews, and regular messages
- Simple mode: agent auto-decides after brief thinking, outputs READY signal
- UltraThink mode: agent asks questions, proposes 2-3 options, waits for user direction
- New `chat` ClientMessage type for multi-turn conversation
- New `agent:thinking` and `agent:option` ServerMessage types (already defined in FAU-45 ws.ts)

### Error Retry
- New `retry` ClientMessage type
- Store original SectionPlan per section for re-use on retry
- Max 3 retries per section
- Backend re-spawns a single builder with original design guidance

## Implementation

### Conversation agent

File: `packages/api/src/agents/conversation.ts`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { loadPrompt } from "./prompt-loader";

interface ConversationTurn { role: "user" | "assistant"; content: string; }

export interface ConversationState {
  sessionId: string;
  history: ConversationTurn[];
  mode: "simple" | "ultrathink";
  isReady: boolean;
  enrichedPrompt: string;
}

const conversations = new Map<string, ConversationState>();

export function getConversation(sessionId: string): ConversationState | undefined {
  return conversations.get(sessionId);
}

export async function startConversation(sessionId: string, userPrompt: string, mode: "simple" | "ultrathink"): Promise<void> {
  const state: ConversationState = {
    sessionId, history: [{ role: "user", content: userPrompt }], mode, isReady: false, enrichedPrompt: "",
  };
  conversations.set(sessionId, state);

  const modeInstruction = mode === "simple"
    ? "Mode: SIMPLE. Analyze quickly, share brief thinking, then output [READY] with your enriched design brief. Do NOT ask questions — make smart decisions yourself."
    : "Mode: ULTRATHINK. Analyze thoroughly, share thinking, propose 2-3 design options with HTML preview snippets. Ask the user which direction they prefer. Only output [READY] after user confirms.";

  await runAgentTurn(state, modeInstruction);
}

export async function continueConversation(sessionId: string, userMessage: string): Promise<void> {
  const state = conversations.get(sessionId);
  if (!state) return;
  state.history.push({ role: "user", content: userMessage });
  await runAgentTurn(state, "Continue the conversation. If the user has given enough direction, output [READY] with the final design brief.");
}

async function runAgentTurn(state: ConversationState, modeInstruction: string): Promise<void> {
  const systemPrompt = loadPrompt("conversation");
  const { sessionId, history } = state;

  const historyText = history.map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content}`).join("\n\n");

  let fullResponse = "";

  for await (const message of query({
    prompt: `${modeInstruction}\n\n## Conversation:\n\n${historyText}\n\nRespond as the design agent.`,
    options: { systemPrompt, allowedTools: [], maxTurns: 1 },
  })) {
    if ("result" in message && message.result) {
      fullResponse = message.result;
    }
  }

  state.history.push({ role: "assistant", content: fullResponse });
  streamParsedContent(sessionId, fullResponse);

  // Check for READY signal
  if (fullResponse.includes("[READY]")) {
    state.isReady = true;
    const match = fullResponse.match(/\[READY\]([\s\S]*?)(\[\/READY\]|$)/);
    state.enrichedPrompt = match ? match[1].trim() : fullResponse.replace("[READY]", "").trim();
    connectionStore.broadcast(sessionId, { type: "ultrathink:ready", enrichedPrompt: state.enrichedPrompt });
  }
}

/**
 * Parse agent response into structured messages.
 * [THINKING]...[/THINKING] → agent:thinking
 * [OPTION id="x" title="y"]...[/OPTION] → agent:option
 * [READY]...[/READY] → triggers generation
 * Everything else → agent:log
 */
function streamParsedContent(sessionId: string, text: string): void {
  // Thinking blocks
  for (const match of text.matchAll(/\[THINKING\]([\s\S]*?)\[\/THINKING\]/g)) {
    connectionStore.broadcast(sessionId, { type: "agent:thinking", agentId: "designer", thought: match[1].trim() });
  }

  // Option blocks
  for (const match of text.matchAll(/\[OPTION\s+id="([^"]+)"\s+title="([^"]+)"\]([\s\S]*?)\[\/OPTION\]/g)) {
    const content = match[3].trim();
    const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
    connectionStore.broadcast(sessionId, {
      type: "agent:option", agentId: "designer", optionId: match[1], title: match[2],
      description: content.replace(/```html[\s\S]*?```/, "").trim(),
      previewHtml: htmlMatch?.[1]?.trim(),
    });
  }

  // Clean text (strip markers)
  const clean = text
    .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/g, "")
    .replace(/\[OPTION[\s\S]*?\[\/OPTION\]/g, "")
    .replace(/\[READY\][\s\S]*?(\[\/READY\]|$)/g, "")
    .trim();
  if (clean) {
    connectionStore.broadcast(sessionId, { type: "agent:log", agentId: "designer", message: clean });
  }
}
```

### Conversation system prompt

File: `packages/api/prompts/conversation.md`

```markdown
# AVV Design Conversation Agent

You are a senior UI/UX designer. Your goal: understand the user's vision, fill gaps with design expertise, and produce a rich design brief.

## Response Format

Use these blocks:

[THINKING]Your internal reasoning — what you're considering, trade-offs, principles[/THINKING]

[OPTION id="a" title="Clean Minimal"]
Description of this direction.
```html
<div style="padding:24px;background:white;border-radius:12px;font-family:system-ui;max-width:300px">
  <h2 style="font-size:20px;color:#0f172a;margin:0 0 8px">Preview vibe</h2>
  <p style="font-size:14px;color:#64748b;margin:0">Clean lines, whitespace, blue accents</p>
</div>
```
[/OPTION]

[READY]
Full enriched design brief — page structure, visual style, colors, typography, sections, content tone.
[/READY]

## Mode Rules

**SIMPLE**: Brief thinking → auto-decide → [READY] immediately. No questions.
**ULTRATHINK**: Detailed thinking → 2-3 options with HTML previews → ask user → wait for response → [READY] after confirmation.

## Design Expertise

Consider: page archetype, visual hierarchy, color psychology, typography pairing, spacing rhythm, accessibility, mobile-first, common anti-patterns.

## Anti-Patterns
- No generic responses — reference the specific product
- Max 3 options — more is overwhelming
- Keep HTML previews tiny (mood cards, not full sections)
- In ULTRATHINK, never output [READY] before user confirms
```

### Plan store for retry

File: `packages/api/src/store/plan-store.ts`

```typescript
import type { SectionPlan } from "@avv/shared";

class PlanStore {
  private plans = new Map<string, Map<string, SectionPlan>>();

  save(pageId: string, sectionId: string, plan: SectionPlan): void {
    if (!this.plans.has(pageId)) this.plans.set(pageId, new Map());
    this.plans.get(pageId)!.set(sectionId, plan);
  }

  get(pageId: string, sectionId: string): SectionPlan | undefined {
    return this.plans.get(pageId)?.get(sectionId);
  }
}

export const planStore = new PlanStore();
```

### Retry handler

File: `packages/api/src/agents/retrier.ts`

```typescript
import { query, createSdkMcpServer, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { planStore } from "../store/plan-store";
import { loadPrompt } from "./prompt-loader";
import { submitComponentTool } from "./tools/submit-component";
import { extractComponentResult } from "./component-collector";

const MAX_RETRIES = 3;
const retryCounts = new Map<string, number>();

export async function retrySection(sessionId: string, pageId: string, sectionId: string): Promise<void> {
  const count = (retryCounts.get(sectionId) ?? 0) + 1;
  if (count > MAX_RETRIES) {
    connectionStore.broadcast(sessionId, { type: "error", message: `Max retries (${MAX_RETRIES}) reached.` });
    return;
  }
  retryCounts.set(sectionId, count);

  const plan = planStore.get(pageId, sectionId);
  if (!plan) {
    connectionStore.broadcast(sessionId, { type: "error", message: "Original plan not found — re-generate the page." });
    return;
  }

  connectionStore.broadcast(sessionId, { type: "section:status", pageId, sectionId, status: "generating" });
  connectionStore.broadcast(sessionId, { type: "agent:log", agentId: "retrier", message: `Retrying "${plan.name}" (${count}/${MAX_RETRIES})...` });

  const mcpServer = createSdkMcpServer({ name: "avv-tools", tools: [submitComponentTool] });
  const collected: SDKMessage[] = [];

  try {
    for await (const msg of query({
      prompt: `Build the "${plan.name}" section.\n\n**Description:** ${plan.description}\n**Design:** ${plan.designGuidance}\n\nThis is retry attempt ${count}. Generate clean HTML. Call mcp__avv-tools__submit_component with result.`,
      options: {
        systemPrompt: loadPrompt("builder"),
        allowedTools: ["mcp__avv-tools__submit_component"],
        mcpServers: { "avv-tools": mcpServer },
        maxTurns: 5,
      },
    })) { collected.push(msg); }

    const result = extractComponentResult(collected);
    if (result) {
      connectionStore.broadcast(sessionId, { type: "section:updated", pageId, sectionId, updates: { html: result.html, css: result.css, status: "ready" } });
    } else {
      connectionStore.broadcast(sessionId, { type: "section:status", pageId, sectionId, status: "error" });
    }
  } catch (err) {
    console.error("[Retrier] Failed:", err);
    connectionStore.broadcast(sessionId, { type: "section:status", pageId, sectionId, status: "error" });
  }
}
```

### Save plans in orchestrator

File: `packages/api/src/agents/orchestrator.ts` — add after creating sections (Step 2):

```typescript
import { planStore } from "../store/plan-store";

// After creating the page with sections:
for (const sectionPlan of plan.sections) {
  const section = sections.find((s) => s.name === sectionPlan.name);
  if (section) planStore.save(pageId, section.id, sectionPlan);
}
```

### Updated WebSocket handler

File: `packages/api/src/ws.ts` — add `chat` and `retry` cases to `handleClientMessage`:

```typescript
import { startConversation, continueConversation, getConversation } from "./agents/conversation";
import { retrySection } from "./agents/retrier";
import { orchestrate } from "./agents/orchestrator";

// Replace the "generate" case:
case "generate": {
  const session = sessionStore.create(msg.prompt, msg.mode);
  connectionStore.add(session.id, ws);
  ws.data.sessionId = session.id;
  connectionStore.send(ws, { type: "session:started", sessionId: session.id });

  startConversation(session.id, msg.prompt, msg.mode).catch((err) => {
    console.error("[Conversation] Failed:", err);
    connectionStore.send(ws, { type: "error", message: "Conversation failed" });
  });
  break;
}

// Add chat case:
case "chat": {
  const sid = ws.data.sessionId;
  if (!sid) break;

  const convo = getConversation(sid);
  if (convo?.isReady) {
    // Ready → trigger generation
    orchestrate({ prompt: convo.enrichedPrompt, mode: convo.mode, sessionId: sid }).catch((err) => {
      console.error("[Orchestrate] Failed:", err);
      connectionStore.send(ws, { type: "error", message: "Generation failed" });
    });
  } else {
    continueConversation(sid, (msg as any).message).catch((err) => {
      console.error("[Conversation] Failed:", err);
      connectionStore.send(ws, { type: "error", message: "Chat failed" });
    });
  }
  break;
}

// Add retry case:
case "retry": {
  const sid = ws.data.sessionId;
  if (!sid) break;
  retrySection(sid, (msg as any).pageId, (msg as any).sectionId).catch((err) => {
    console.error("[Retry] Failed:", err);
    connectionStore.send(ws, { type: "error", message: "Retry failed" });
  });
  break;
}
```

### Add `chat` and `retry` to ClientMessage

File: `packages/shared/src/types/ws.ts` — add to the ClientMessage union:

```typescript
  | { type: "chat"; message: string }
  | { type: "retry"; pageId: string; sectionId: string }
```

### Update prompt-loader

File: `packages/api/src/agents/prompt-loader.ts` — update required prompts:

```typescript
const REQUIRED_PROMPTS = ["orchestrator", "builder", "conversation"] as const;
```

### Delete old modules

Delete:
- `packages/api/src/agents/enricher.ts`
- `packages/api/src/agents/enricher.test.ts`
- `packages/api/src/agents/ultrathink.ts`
- `packages/api/prompts/enricher.md`
- `packages/api/prompts/ultrathink.md`

### Update agent barrel export

File: `packages/api/src/agents/index.ts`:

```typescript
export { orchestrate } from "./orchestrator";
export { startConversation, continueConversation, getConversation } from "./conversation";
export { retrySection } from "./retrier";
```

### Update store barrel export

File: `packages/api/src/store/index.ts`:

```typescript
export { sessionStore } from "./session-store";
export { connectionStore } from "./connection-store";
export { planStore } from "./plan-store";
export type { WSData } from "./connection-store";
```

## Testing Strategy

```bash
# Agentic Chat — Simple mode:
# 1. Type "Todo app" → Simple → Send
# 2. Chat shows thinking → auto-enriched → generation starts

# Agentic Chat — UltraThink mode:
# 1. Type "Analytics dashboard" → UltraThink → Send
# 2. Chat shows thinking → 2-3 options with previews → asks preference
# 3. Reply "Option B but darker" → agent refines → READY → generation starts

# Error Retry:
# 1. Generate page → if a section fails → layers panel shows retry icon
# 2. Click retry → section re-generates → appears on canvas
# 3. Retry 4th time → "max retries reached" error

# Type check
pnpm type-check
```

## Out of Scope

- Streaming token-by-token
- Voice input
- Automatic retry
- Configurable retry limits
