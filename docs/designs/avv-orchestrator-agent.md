# AVV Orchestrator Agent

## Context

With the backend API in place (FAU-35), we need the brain of the system — the main orchestrator agent. This agent takes a user prompt, analyzes it, decomposes it into UI components, and dispatches parallel builder subagents via the Claude Agent SDK (TypeScript). Each subagent generates one component and streams results back through WebSocket.

## Requirements

- Use `@anthropic-ai/claude-agent-sdk` `query()` function to run the orchestrator
- The orchestrator agent takes a prompt and produces a structured component plan (JSON)
- Based on the plan, spawn parallel builder subagents (one per component)
- Stream agent progress (status updates, component HTML) to clients via WebSocket
- Support cancellation of in-progress generation
- Orchestrator system prompt loaded from an `.md` file for easy editing

## Implementation

### Install Claude Agent SDK

Add to `packages/api/package.json` dependencies:

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2",
    "hono": "^4",
    "@avv/shared": "workspace:*"
  }
}
```

### Component plan types

File: `packages/shared/src/types/agent.ts`

```typescript
/** A single component in the orchestrator's decomposition plan */
export interface ComponentPlan {
  name: string;
  description: string;
  htmlTag: string;
  order: number;
  width: number;
  height: number;
  x: number;
  y: number;
  designGuidance: string;
}

/** The full plan output by the orchestrator */
export interface DesignPlan {
  title: string;
  summary: string;
  components: ComponentPlan[];
}
```

Update `packages/shared/src/types/index.ts`:

```typescript
export * from "./api";
export * from "./canvas";
export * from "./ws";
export * from "./agent";
```

### Orchestrator service

File: `packages/api/src/agents/orchestrator.ts`

```typescript
import { query, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { join } from "path";
import type { DesignPlan, ComponentPlan, AVVComponent } from "@avv/shared";
import { connectionStore } from "../store";
import { sessionStore } from "../store";

/** Load system prompt from markdown file */
function loadSystemPrompt(name: string): string {
  const promptPath = join(import.meta.dir, "..", "..", "prompts", `${name}.md`);
  return readFileSync(promptPath, "utf-8");
}

/**
 * Builds the agent definitions for builder subagents.
 * One subagent per component in the plan.
 */
function createBuilderAgents(
  plan: DesignPlan,
  sessionId: string
): Record<string, AgentDefinition> {
  const builderPrompt = loadSystemPrompt("builder");
  const agents: Record<string, AgentDefinition> = {};

  for (const component of plan.components) {
    const agentName = `builder-${component.order}`;
    agents[agentName] = {
      description: `Builds the "${component.name}" UI component. Use this agent when generating the ${component.name} section.`,
      prompt: `${builderPrompt}

## Your Task

You are building the "${component.name}" component for a web page.

**Component description:** ${component.description}
**Design guidance:** ${component.designGuidance}
**Target dimensions:** ${component.width}x${component.height}px

## Output Format

You MUST respond with ONLY a JSON object in this exact format (no markdown, no explanation):

{
  "name": "${component.name}",
  "html": "<the HTML content>",
  "css": "<the CSS styles>"
}

The HTML should be a self-contained fragment that renders correctly in an iframe.
Use inline Tailwind-style utility classes or write CSS in the css field.
Make it visually polished, modern, and responsive within the given dimensions.`,
      tools: [],
      model: "sonnet",
    };
  }

  return agents;
}

/**
 * Parses the orchestrator's plan response from its text output.
 * Expects a JSON block in the response.
 */
function parsePlanFromResponse(text: string): DesignPlan | null {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*"components"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as DesignPlan;
  } catch {
    return null;
  }
}

/**
 * Parses a builder subagent's component output.
 */
function parseComponentFromResponse(text: string): { name: string; html: string; css: string } | null {
  const jsonMatch = text.match(/\{[\s\S]*"html"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export interface OrchestrateOptions {
  prompt: string;
  mode: "simple" | "ultrathink";
  sessionId: string;
}

/**
 * Main orchestration flow:
 * 1. Run orchestrator agent to decompose prompt into component plan
 * 2. Spawn builder subagents in parallel (one per component)
 * 3. Stream results to client via WebSocket
 */
export async function orchestrate({ prompt, mode, sessionId }: OrchestrateOptions): Promise<void> {
  const orchestratorPrompt = loadSystemPrompt("orchestrator");

  sessionStore.update(sessionId, { status: "generating" });

  // Step 1: Generate the component plan
  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "orchestrator",
    message: "Analyzing prompt and creating component plan...",
  });

  let planText = "";

  for await (const message of query({
    prompt: `${orchestratorPrompt}

## User Request

"${prompt}"

## Mode: ${mode}

Decompose this into a component plan. Respond with ONLY a JSON object in DesignPlan format:

{
  "title": "Page title",
  "summary": "Brief summary of the design approach",
  "components": [
    {
      "name": "Component Name",
      "description": "What this component does",
      "htmlTag": "section",
      "order": 0,
      "width": 800,
      "height": 400,
      "x": 100,
      "y": 100,
      "designGuidance": "Specific design instructions for this component"
    }
  ]
}

Place components in a vertical stack layout. First component at y=100, subsequent ones below with 40px gap. All components at x=100. Standard width is 800px.`,
    options: {
      systemPrompt: orchestratorPrompt,
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    if ("result" in message) {
      planText = message.result;
    }
  }

  const plan = parsePlanFromResponse(planText);
  if (!plan) {
    connectionStore.broadcast(sessionId, {
      type: "error",
      message: "Failed to generate component plan",
    });
    sessionStore.update(sessionId, { status: "error" });
    return;
  }

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "orchestrator",
    message: `Plan created: ${plan.components.length} components to build`,
  });

  // Step 2: Create placeholder components on canvas
  for (const comp of plan.components) {
    const component: AVVComponent = {
      id: crypto.randomUUID(),
      name: comp.name,
      status: "pending",
      html: "",
      css: "",
      prompt: comp.designGuidance,
      agentId: `builder-${comp.order}`,
      iteration: 0,
      width: comp.width,
      height: comp.height,
      x: comp.x,
      y: comp.y,
    };
    connectionStore.broadcast(sessionId, {
      type: "component:created",
      component,
    });
  }

  // Step 3: Spawn builder subagents in parallel
  const builderAgents = createBuilderAgents(plan, sessionId);
  const buildPromises = plan.components.map(async (comp) => {
    const agentName = `builder-${comp.order}`;

    connectionStore.broadcast(sessionId, {
      type: "component:status",
      componentId: comp.name,
      status: "generating",
    });

    let resultText = "";

    try {
      for await (const message of query({
        prompt: `Use the ${agentName} agent to build the "${comp.name}" component.`,
        options: {
          allowedTools: ["Agent"],
          agents: { [agentName]: builderAgents[agentName] },
          maxTurns: 3,
        },
      })) {
        if ("result" in message) {
          resultText = message.result;
        }
      }

      const parsed = parseComponentFromResponse(resultText);
      if (parsed) {
        connectionStore.broadcast(sessionId, {
          type: "component:updated",
          componentId: comp.name,
          updates: {
            html: parsed.html,
            css: parsed.css,
            status: "ready",
          },
        });
      } else {
        connectionStore.broadcast(sessionId, {
          type: "component:status",
          componentId: comp.name,
          status: "error",
        });
      }
    } catch (err) {
      console.error(`[Agent] Builder ${agentName} failed:`, err);
      connectionStore.broadcast(sessionId, {
        type: "component:status",
        componentId: comp.name,
        status: "error",
      });
    }
  });

  // Wait for all builders to complete
  await Promise.allSettled(buildPromises);

  // Step 4: Mark session as done
  sessionStore.update(sessionId, { status: "done" });
  connectionStore.broadcast(sessionId, {
    type: "generation:done",
    sessionId,
  });
}
```

### Wire orchestrate into the generate route

File: `packages/api/src/routes/generate.ts` (replace existing)

```typescript
import { Hono } from "hono";
import type { ApiResponse, GenerateRequest, Session } from "@avv/shared";
import { sessionStore } from "../store";
import { orchestrate } from "../agents/orchestrator";

export const generateRoute = new Hono();

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

  // Fire and forget — results stream via WebSocket
  orchestrate({
    prompt: body.prompt,
    mode: body.mode,
    sessionId: session.id,
  }).catch((err) => {
    console.error("[Orchestrate] Fatal error:", err);
    sessionStore.update(session.id, { status: "error" });
  });

  const response: ApiResponse<Session> = { success: true, data: session };
  return c.json(response, 201);
});
```

### Wire orchestrate into WebSocket handler

File: `packages/api/src/ws.ts` — update the `handleClientMessage` function:

In the existing `ws.ts`, replace the `handleClientMessage` function body:

```typescript
import { orchestrate } from "./agents/orchestrator";
import { sessionStore } from "./store";

function handleClientMessage(ws: ServerWebSocket<WSData>, msg: ClientMessage): void {
  switch (msg.type) {
    case "generate": {
      const session = sessionStore.create(msg.prompt, msg.mode);
      // Associate this WS with the new session
      connectionStore.add(session.id, ws);
      ws.data.sessionId = session.id;

      connectionStore.send(ws, {
        type: "session:started",
        sessionId: session.id,
      });

      // Fire and forget
      orchestrate({
        prompt: msg.prompt,
        mode: msg.mode,
        sessionId: session.id,
      }).catch((err) => {
        console.error("[Orchestrate] Fatal error:", err);
        connectionStore.send(ws, { type: "error", message: "Generation failed" });
      });
      break;
    }
    case "iterate":
      // Will be implemented in avv-component-iteration
      console.log(`[WS] Iterate request: ${msg.componentId}`);
      break;
    case "cancel": {
      sessionStore.update(msg.sessionId, { status: "error" });
      console.log(`[WS] Cancel request: ${msg.sessionId}`);
      break;
    }
  }
}
```

### Orchestrator system prompt file

File: `packages/api/prompts/orchestrator.md`

```markdown
# AVV Orchestrator Agent

You are the orchestrator for AVV (AI Visual Vibe Engineer), a tool that generates web UI mockups.

## Your Role

You receive a user's prompt describing a web page or UI they want to build. Your job is to:

1. Analyze the request and fill in any gaps with UI/UX best practices
2. Decompose the page into distinct, buildable components
3. Output a structured JSON plan

## Design Principles

When decomposing a page, follow these principles:

- **Visual hierarchy**: Place the most important content first (hero > features > social proof > CTA)
- **Spacing**: Use consistent spacing between sections (40px gaps)
- **Component sizing**: Standard width is 800px. Heights vary by content type:
  - Navigation: 80px
  - Hero sections: 400-500px
  - Feature grids: 350-400px
  - Testimonials: 300px
  - CTAs: 200-250px
  - Footers: 200px
- **Modern patterns**: Prefer card layouts, rounded corners, subtle shadows, generous whitespace

## Anti-Patterns to Avoid

- Do NOT create components that are too small to be meaningful (<100px height)
- Do NOT create more than 8 components for a single page
- Do NOT overlap components on the canvas
- Do NOT use placeholder text like "Lorem ipsum" in component descriptions
- Do NOT ignore the user's specific requirements in favor of generic layouts
```

### Builder system prompt file

File: `packages/api/prompts/builder.md`

```markdown
# AVV Builder Agent

You are a UI builder agent for AVV. You generate beautiful, modern HTML/CSS components.

## Your Role

You receive a component specification and produce self-contained HTML + CSS that renders
in an iframe preview. Your output must be visually polished and production-quality.

## Design Rules

- Use modern CSS: flexbox, grid, custom properties, clamp(), container queries
- Prefer system fonts: system-ui, -apple-system, sans-serif
- Use a cohesive color palette (slate/blue/indigo for professional, warm tones for friendly)
- Generous padding: minimum 24px on all sides of content areas
- Typography scale: 14px body, 18px lead, 24px h3, 32px h2, 48px h1
- Border radius: 8px for cards, 12px for larger containers, 9999px for pills
- Shadows: 0 1px 3px rgba(0,0,0,0.1) for subtle, 0 4px 12px rgba(0,0,0,0.15) for elevated
- Use real-sounding content, not lorem ipsum

## Anti-Patterns

- No inline event handlers (onclick, etc.) — this is a static preview
- No external dependencies (no CDN links, no Google Fonts URLs)
- No JavaScript — HTML and CSS only
- No images with external URLs — use CSS gradients, SVG data URIs, or emoji as visual elements
- No fixed positioning — everything must be relative/static within the iframe
- No dark backgrounds unless specifically requested
```

## Testing Strategy

```bash
# Install the agent SDK
cd packages/api && bun add @anthropic-ai/claude-agent-sdk

# Ensure claude CLI is available
which claude

# Start the API server
bun run dev

# Trigger generation via REST
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Landing page for an AI writing tool","mode":"simple"}'

# Monitor WebSocket in another terminal (using wscat)
# wscat -c "ws://localhost:3001/ws?sessionId=<session-id-from-above>"
# Expected sequence:
# 1. {"type":"session:started","sessionId":"..."}
# 2. {"type":"agent:log","agentId":"orchestrator","message":"Analyzing prompt..."}
# 3. {"type":"agent:log","agentId":"orchestrator","message":"Plan created: N components..."}
# 4. {"type":"component:created","component":{...}} (one per component)
# 5. {"type":"component:status","componentId":"...","status":"generating"} (parallel)
# 6. {"type":"component:updated","componentId":"...","updates":{...}} (as each finishes)
# 7. {"type":"generation:done","sessionId":"..."}
```

## Out of Scope

- UltraThink mode questionnaire flow (avv-ultrathink-mode)
- Image generation agent (avv-image-agent)
- Component iteration (avv-component-iteration)
- Cancellation implementation beyond status update
- Prompt caching or optimization
