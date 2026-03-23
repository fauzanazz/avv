# AVV Simple Mode

## Context

With the agent-canvas bridge in place (FAU-39), this doc implements the Simple mode flow. Simple mode takes a user prompt, automatically enriches it with UI/UX best practices (no questions asked), and triggers the orchestrator immediately.

## Requirements

- When user selects "Simple" mode and clicks Generate, the prompt is enriched server-side
- Enrichment adds layout assumptions, color scheme, typography, and component structure hints
- No user interaction required — just prompt in, generation starts
- Enrichment is fast (single LLM call or template-based)

## Implementation

### Prompt enricher

File: `packages/api/src/agents/enricher.ts`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { join } from "path";

function loadSystemPrompt(name: string): string {
  const promptPath = join(import.meta.dir, "..", "..", "prompts", `${name}.md`);
  return readFileSync(promptPath, "utf-8");
}

/**
 * Enriches a user prompt with UI/UX best practices.
 * Returns an enriched prompt that gives the orchestrator more to work with.
 */
export async function enrichPrompt(userPrompt: string): Promise<string> {
  const enricherPrompt = loadSystemPrompt("enricher");

  let enrichedResult = "";

  for await (const message of query({
    prompt: `${enricherPrompt}

## User's original prompt:

"${userPrompt}"

Enrich this prompt. Output ONLY the enriched prompt text — no JSON, no markdown, no explanation.`,
    options: {
      allowedTools: [],
      maxTurns: 1,
      model: "haiku",
    },
  })) {
    if ("result" in message) {
      enrichedResult = message.result;
    }
  }

  return enrichedResult || userPrompt;
}
```

### Enricher system prompt

File: `packages/api/prompts/enricher.md`

```markdown
# AVV Prompt Enricher

You receive a brief user prompt describing a web page they want to build. Your job is to expand it into a detailed design brief by filling in gaps with UI/UX best practices.

## What to add:

1. **Page structure**: Identify the likely sections (nav, hero, features, etc.)
2. **Visual style**: Suggest a color palette (use CSS color names or hex), typography style, overall mood
3. **Layout pattern**: Grid vs single-column, card-based vs list-based
4. **Content tone**: Professional, playful, minimal, bold
5. **Key interactions**: Hover states, CTAs, visual hierarchy emphasis

## Rules:

- DO NOT change the user's intent — only fill in gaps
- Keep the enriched prompt under 500 words
- Write it as a natural language description, not a list
- If the user specified specific requirements (color, layout), preserve them exactly
- Default to: modern, clean, professional, blue/slate palette, generous whitespace

## Example:

Input: "landing page for my todo app"

Output: "A modern, clean landing page for a todo/task management app. The page should use a blue-slate color palette with white backgrounds and generous whitespace. Layout: single hero section with app screenshot/mockup centered, followed by a 3-column feature grid highlighting key features like task organization, deadlines, and collaboration. Include a navigation bar with logo and CTA button, a hero section with bold headline and subheadline, a feature showcase section with icon-led cards, a testimonial or social proof section, and a footer with links. Typography: system-ui font stack, 48px hero heading, 18px body text. Overall mood: professional yet approachable, emphasizing simplicity and productivity."
```

### Wire enricher into orchestrator

File: `packages/api/src/agents/orchestrator.ts` — update the `orchestrate` function to call enricher in simple mode.

At the beginning of the `orchestrate` function, add before Step 1:

```typescript
import { enrichPrompt } from "./enricher";

export async function orchestrate({ prompt, mode, sessionId }: OrchestrateOptions): Promise<void> {
  let finalPrompt = prompt;

  // Simple mode: auto-enrich the prompt
  if (mode === "simple") {
    connectionStore.broadcast(sessionId, {
      type: "agent:log",
      agentId: "enricher",
      message: "Enriching prompt with UI/UX best practices...",
    });

    finalPrompt = await enrichPrompt(prompt);

    connectionStore.broadcast(sessionId, {
      type: "agent:log",
      agentId: "enricher",
      message: "Prompt enriched. Starting design...",
    });
  }

  // ... rest of orchestrate uses finalPrompt instead of prompt
  sessionStore.update(sessionId, { status: "generating" });
  // In Step 1, use finalPrompt in the query prompt instead of prompt
}
```

## Testing Strategy

```bash
# Start both servers
pnpm dev

# Open http://localhost:5173
# 1. Type "todo app" in the prompt bar
# 2. Select "Simple" mode
# 3. Click Generate
# 4. Status bar should show: "[enricher] Enriching prompt with UI/UX best practices..."
# 5. Then: "[enricher] Prompt enriched. Starting design..."
# 6. Then normal orchestrator flow continues
# 7. The resulting components should be richer than just "todo app" would produce
```

## Out of Scope

- UltraThink mode (avv-ultrathink-mode)
- Enrichment quality evaluation or A/B testing
- User-configurable enrichment rules
