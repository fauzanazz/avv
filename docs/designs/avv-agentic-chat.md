# Agentic Chat — Multi-Turn Design Conversation

## Context

V1's chat flow is linear and form-like: user types prompt → (optional canned questions) → enriched prompt → generate. This doesn't feel like working with a design partner. The chat should be a true multi-turn conversation where the agent thinks out loud, proposes design options with inline HTML previews, and iterates based on user feedback — like pair-designing with a senior designer.

### V1 problems this fixes:
- Enricher is a silent black box (haiku one-shot, user sees nothing)
- UltraThink is a form (canned questions → confirm → done)
- No visibility into the agent's reasoning
- No design options to choose from
- No inline previews before committing to generation

### New model:
```
User: "Landing page for my AI writing tool"
Agent: [thinking] Analyzing your request...
Agent: I see you want a landing page for an AI writing tool. Let me consider a few directions:
Agent: [option A] "Clean Minimal" — white space focused, single hero, blue accent
       [inline preview: small HTML card showing the vibe]
Agent: [option B] "Bold & Dynamic" — gradient hero, animated elements, dark sections
       [inline preview: small HTML card showing the vibe]
User: "I like A but make the hero bigger"
Agent: [thinking] Adjusting hero proportions...
Agent: Got it — large hero with centered copy. Starting generation now.
[generation begins]
```

## Requirements

- Replace linear enricher/ultrathink flow with a single conversation agent
- Agent streams thinking tokens visible in chat (dimmed/italic)
- Agent can propose design options with inline HTML previews
- User can reply with natural language to refine direction
- Both Simple and UltraThink modes use the conversation agent — Simple just has fewer turns
- Simple mode: agent auto-decides after 1 thinking turn, then generates
- UltraThink mode: agent asks questions, proposes options, waits for user input, iterates
- New WebSocket message types for thinking and options (already in the page-model ws.ts types)
- Chat history persists per session

## Implementation

### Conversation agent (backend)

File: `packages/api/src/agents/conversation.ts`

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { loadPrompt } from "./prompt-loader";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationState {
  sessionId: string;
  history: ConversationTurn[];
  mode: "simple" | "ultrathink";
  isReady: boolean;
  enrichedPrompt: string;
}

/** Active conversations per session */
const conversations = new Map<string, ConversationState>();

export function getConversation(sessionId: string): ConversationState | undefined {
  return conversations.get(sessionId);
}

/**
 * Start a new design conversation.
 * The agent analyzes the prompt and responds with thinking + options.
 */
export async function startConversation(
  sessionId: string,
  userPrompt: string,
  mode: "simple" | "ultrathink"
): Promise<void> {
  const systemPrompt = loadPrompt("conversation");
  const state: ConversationState = {
    sessionId,
    history: [{ role: "user", content: userPrompt }],
    mode,
    isReady: false,
    enrichedPrompt: "",
  };
  conversations.set(sessionId, state);

  const modeInstruction = mode === "simple"
    ? `Mode: SIMPLE. Analyze quickly, share your thinking briefly, then output the READY signal with your enriched design brief. Do NOT ask the user questions — make smart decisions yourself.`
    : `Mode: ULTRATHINK. Analyze thoroughly. Share your thinking. Propose 2-3 design direction options with short HTML preview snippets. Ask the user which direction they prefer. Only output the READY signal after the user has confirmed a direction.`;

  await runAgentTurn(state, systemPrompt, modeInstruction);
}

/**
 * Continue conversation with user's reply.
 */
export async function continueConversation(
  sessionId: string,
  userMessage: string
): Promise<void> {
  const state = conversations.get(sessionId);
  if (!state) return;

  state.history.push({ role: "user", content: userMessage });

  const systemPrompt = loadPrompt("conversation");
  await runAgentTurn(state, systemPrompt, "Continue the conversation. If the user has given enough direction, output the READY signal.");
}

/**
 * Run one agent turn — streams thinking and response to the chat.
 */
async function runAgentTurn(
  state: ConversationState,
  systemPrompt: string,
  modeInstruction: string
): Promise<void> {
  const { sessionId, history, mode } = state;

  // Build the full prompt from conversation history
  const historyText = history
    .map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content}`)
    .join("\n\n");

  let fullResponse = "";
  let isStreaming = false;

  for await (const message of query({
    prompt: `${modeInstruction}

## Conversation so far:

${historyText}

Respond as the design agent. Follow the system prompt rules for formatting.`,
    options: {
      systemPrompt,
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    // Stream assistant messages
    const msgAny = message as any;

    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === "text") {
          fullResponse = block.text;
          // Parse and stream different content types
          streamParsedContent(sessionId, block.text);
        }
      }
    }

    if ("result" in message && message.result) {
      fullResponse = message.result;
      streamParsedContent(sessionId, message.result);
    }
  }

  // Save assistant turn to history
  state.history.push({ role: "assistant", content: fullResponse });

  // Check if the agent signaled READY
  if (fullResponse.includes("[READY]")) {
    state.isReady = true;
    // Extract enriched prompt (everything between [READY] and [/READY])
    const readyMatch = fullResponse.match(/\[READY\]([\s\S]*?)(\[\/READY\]|$)/);
    state.enrichedPrompt = readyMatch
      ? readyMatch[1].trim()
      : fullResponse.replace("[READY]", "").trim();

    connectionStore.broadcast(sessionId, {
      type: "ultrathink:ready",
      enrichedPrompt: state.enrichedPrompt,
    });
  }
}

/**
 * Parse the agent's response and broadcast structured messages.
 *
 * Convention:
 * - Lines starting with [THINKING] ... [/THINKING] → agent:thinking
 * - Lines starting with [OPTION id="X" title="Y"] html... [/OPTION] → agent:option
 * - Everything else → agent:log (regular message)
 * - [READY] enriched prompt [/READY] → triggers generation
 */
function streamParsedContent(sessionId: string, text: string): void {
  // Extract thinking blocks
  const thinkingRegex = /\[THINKING\]([\s\S]*?)\[\/THINKING\]/g;
  let match;
  while ((match = thinkingRegex.exec(text)) !== null) {
    connectionStore.broadcast(sessionId, {
      type: "agent:thinking",
      agentId: "designer",
      thought: match[1].trim(),
    });
  }

  // Extract option blocks
  const optionRegex = /\[OPTION\s+id="([^"]+)"\s+title="([^"]+)"\]([\s\S]*?)\[\/OPTION\]/g;
  while ((match = optionRegex.exec(text)) !== null) {
    const optionContent = match[3].trim();
    // Split description from HTML preview
    const htmlMatch = optionContent.match(/```html\n([\s\S]*?)```/);
    const description = optionContent.replace(/```html[\s\S]*?```/, "").trim();

    connectionStore.broadcast(sessionId, {
      type: "agent:option",
      agentId: "designer",
      optionId: match[1],
      title: match[2],
      description,
      previewHtml: htmlMatch ? htmlMatch[1].trim() : undefined,
    });
  }

  // Extract regular message (strip all block markers)
  const cleanText = text
    .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/g, "")
    .replace(/\[OPTION[\s\S]*?\[\/OPTION\]/g, "")
    .replace(/\[READY\][\s\S]*?(\[\/READY\]|$)/g, "")
    .trim();

  if (cleanText) {
    connectionStore.broadcast(sessionId, {
      type: "agent:log",
      agentId: "designer",
      message: cleanText,
    });
  }
}
```

### Conversation system prompt

File: `packages/api/prompts/conversation.md`

```markdown
# AVV Design Conversation Agent

You are a senior UI/UX designer having a conversation with the user about what they want to build. Your goal is to understand their vision, fill gaps with design expertise, and produce a rich design brief.

## How to Respond

Use these formatting blocks in your response:

### Thinking (show your reasoning)
[THINKING]Your internal reasoning here — what you're considering, trade-offs, design principles you're applying[/THINKING]

### Design Options (propose directions)
[OPTION id="a" title="Clean Minimal"]
Description of this direction — what it feels like, key characteristics.
```html
<div style="padding:24px;background:white;border-radius:12px;font-family:system-ui;max-width:300px">
  <h2 style="font-size:20px;color:#0f172a;margin:0 0 8px">Preview vibe</h2>
  <p style="font-size:14px;color:#64748b;margin:0">Clean lines, lots of whitespace, blue accents</p>
</div>
```
[/OPTION]

### Ready Signal (when you have enough to generate)
[READY]
The full enriched design brief here — this text is passed to the orchestrator.
Include: page structure, visual style, color palette, typography, sections, content tone.
[/READY]

## Behavior Rules

**SIMPLE mode:**
- Show brief thinking (1-2 sentences)
- Do NOT ask questions
- Make smart design decisions based on the prompt
- Output [READY] with enriched brief immediately
- Total response should be concise

**ULTRATHINK mode:**
- Show detailed thinking
- Propose 2-3 design options with HTML preview snippets
- Ask targeted questions about the user's preference
- Wait for user response before outputting [READY]
- Be conversational — this is a design discussion, not a form

## Design Expertise to Apply

When enriching, consider:
- Page archetype (landing, dashboard, portfolio, docs, e-commerce)
- Visual hierarchy and information architecture
- Color psychology (blue=trust, green=growth, purple=premium)
- Typography pairing and scale
- Spacing rhythm and visual density
- Mobile-first responsive patterns
- Accessibility (contrast ratios, font sizes)
- Common anti-patterns to avoid

## Anti-Patterns
- DO NOT be generic — reference the specific product/topic the user described
- DO NOT use jargon without context — explain design decisions simply
- DO NOT propose more than 3 options — it's overwhelming
- DO NOT make the HTML previews complex — they should be tiny mood cards
- DO NOT output [READY] in ULTRATHINK mode before the user confirms direction
```

### New ClientMessage types for chat

File: `packages/shared/src/types/ws.ts` — add to `ClientMessage`:

```typescript
  | { type: "chat"; message: string }
```

### Wire conversation into WebSocket handler

File: `packages/api/src/ws.ts` — update handleClientMessage:

```typescript
import { startConversation, continueConversation, getConversation } from "./agents/conversation";
import { orchestrate } from "./agents/orchestrator";

// In the "generate" case, start a conversation instead of direct orchestration:
case "generate": {
  const session = sessionStore.create(msg.prompt, msg.mode);
  connectionStore.add(session.id, ws);
  ws.data.sessionId = session.id;

  connectionStore.send(ws, { type: "session:started", sessionId: session.id });

  // Start conversation (agent will stream thinking/options)
  startConversation(session.id, msg.prompt, msg.mode).catch((err) => {
    console.error("[Conversation] Failed:", err);
    connectionStore.send(ws, { type: "error", message: "Conversation failed" });
  });
  break;
}

// New case for chat replies:
case "chat": {
  const sid = ws.data.sessionId;
  if (!sid) break;

  const convo = getConversation(sid);
  if (convo?.isReady) {
    // Conversation is done — trigger generation with enriched prompt
    orchestrate({
      prompt: convo.enrichedPrompt,
      mode: convo.mode,
      sessionId: sid,
    }).catch((err) => {
      console.error("[Orchestrate] Failed:", err);
      connectionStore.send(ws, { type: "error", message: "Generation failed" });
    });
  } else {
    // Continue conversation
    continueConversation(sid, msg.message).catch((err) => {
      console.error("[Conversation] Failed:", err);
      connectionStore.send(ws, { type: "error", message: "Chat failed" });
    });
  }
  break;
}

// When ultrathink:ready fires, wait for user to click "Generate"
// or auto-trigger in simple mode
```

### Updated ChatPanel — conversational UI

File: `packages/web/src/components/ChatPanel.tsx` — Key architectural changes:

Replace the form-based Q&A with a chat message list:

```typescript
interface ChatMessage {
  id: string;
  type: "user" | "agent-text" | "agent-thinking" | "agent-option" | "system";
  content: string;
  // For options
  optionId?: string;
  optionTitle?: string;
  previewHtml?: string;
  timestamp: Date;
}

// The ChatPanel renders these as a message list:
// - user messages: right-aligned bubbles
// - agent-text: left-aligned, normal
// - agent-thinking: left-aligned, italic, dimmed, with "thinking" icon
// - agent-option: left-aligned card with title, description, and inline HTML preview
// - system: centered, small, dimmed

// The onMessage handler maps ServerMessage types:
// agent:thinking → agent-thinking message
// agent:option → agent-option message with previewHtml rendered in a tiny iframe
// agent:log → agent-text message
// ultrathink:ready → system message "Ready to generate" + show Generate button

// The input sends { type: "chat", message: text } instead of generate
```

The prompt bar at the bottom becomes a simple chat input. Mode selection moves to a toggle at the top. When the user first sends a message, it sends `{ type: "generate", prompt, mode }`. Subsequent messages send `{ type: "chat", message }`.

### Inline preview for options

```typescript
// Inside ChatPanel, option messages render a small preview:
function OptionPreview({ html }: { html: string }) {
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ width: "100%", height: 120, border: "none", borderRadius: 8, pointerEvents: "none" }}
      title="Option Preview"
    />
  );
}
```

### Remove old enricher and ultrathink modules

Delete these files (replaced by conversation agent):
- `packages/api/src/agents/enricher.ts`
- `packages/api/src/agents/enricher.test.ts`
- `packages/api/src/agents/ultrathink.ts`

Delete these prompt files:
- `packages/api/prompts/enricher.md`
- `packages/api/prompts/ultrathink.md`

Add new prompt file:
- `packages/api/prompts/conversation.md` (defined above)

### Updated prompt-loader — add conversation prompt

File: `packages/api/src/agents/prompt-loader.ts` — update REQUIRED_PROMPTS:

```typescript
const REQUIRED_PROMPTS = ["orchestrator", "builder", "conversation"] as const;
```

## Testing Strategy

```bash
# Start dev servers
pnpm dev

# Test Simple mode:
# 1. Type "Todo app landing page" → Simple mode → Send
# 2. Chat shows: [thinking] "Analyzing... considering a clean minimal approach..."
# 3. Chat shows: agent message with design direction summary
# 4. Chat shows: [READY] indicator → generation starts automatically
# 5. Page appears on canvas

# Test UltraThink mode:
# 1. Type "Dashboard for analytics" → UltraThink mode → Send
# 2. Chat shows: [thinking] "This is an analytics dashboard..."
# 3. Chat shows: 2-3 option cards with inline HTML previews
# 4. Chat shows: "Which direction resonates with you?"
# 5. User types: "I like option B but darker"
# 6. Agent responds with refined thinking, then [READY]
# 7. "Generate" button appears → click → generation starts

# Test multi-turn:
# 1. After option proposal, type "Actually, can we do something more playful?"
# 2. Agent adjusts and proposes new options
# 3. Conversation continues until user is happy
```

## Out of Scope

- Streaming token-by-token (we get full turns from the SDK)
- Voice input
- Image upload for reference
- Saving conversation history to disk
