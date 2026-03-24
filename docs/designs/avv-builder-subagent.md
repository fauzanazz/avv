# AVV Builder Subagent — Structured HTML Output via MCP Tool

## Context

The orchestrator agent (FAU-36) spawns builder subagents, but currently relies on parsing JSON from free-form text output. This is brittle. This doc adds a proper MCP tool (`submit_component`) that builders call to submit structured output, plus validation and Tailwind CDN injection for rich styling in previews.

## Requirements

- Define an MCP tool `submit_component` that builders call with structured `{ name, html, css }` output
- Validate builder output (non-empty HTML, valid structure)
- Inject Tailwind CSS CDN play script into iframe previews for rich utility class support
- Update `ComponentPreview` to include Tailwind CDN
- Refactor orchestrator to use MCP tool-based output instead of text parsing

## Implementation

### MCP tool definition for builders

File: `packages/api/src/agents/tools/submit-component.ts`

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * MCP tool that builder subagents call to submit their generated component.
 * Using a tool ensures structured output instead of brittle text parsing.
 */
export const submitComponentTool = tool(
  "submit_component",
  "Submit the generated UI component. Call this tool with the component name, HTML content, and CSS styles.",
  {
    name: z.string().describe("The component name (e.g., 'Hero Section')"),
    html: z.string().min(1).describe("The HTML content of the component. Must be a valid HTML fragment."),
    css: z.string().describe("CSS styles for the component. Can be empty if using Tailwind classes."),
  },
  async (args) => {
    // Validation
    if (!args.html.trim()) {
      return {
        content: [{ type: "text" as const, text: "Error: HTML content cannot be empty" }],
        isError: true,
      };
    }

    // Store the result — it will be read by the orchestrator after the query completes
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            name: args.name,
            html: args.html,
            css: args.css,
          }),
        },
      ],
    };
  }
);
```

### Install zod dependency

Add to `packages/api/package.json` dependencies:

```json
{
  "dependencies": {
    "zod": "^3.23"
  }
}
```

### Component result collector

File: `packages/api/src/agents/component-collector.ts`

```typescript
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface ComponentResult {
  name: string;
  html: string;
  css: string;
}

/**
 * Extracts component results from agent SDK messages.
 * Iterates in reverse to return the agent's final submission,
 * not an intermediate draft.
 */
export function extractComponentResult(messages: SDKMessage[]): ComponentResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    // Check for tool results containing our component JSON
    const msgAny = msg as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === "tool_result" || block.type === "tool_use") {
          if (block.name === "submit_component" && block.input) {
            const html = block.input.html;
            // Validate: only accept if html is a non-empty string
            if (typeof html !== "string" || !html.trim()) {
              continue;
            }
            return {
              name: block.input.name,
              html,
              css: block.input.css || "",
            };
          }
        }
      }
    }

    // Also check result text as fallback
    if ("result" in msg && typeof msg.result === "string") {
      try {
        const parsed = JSON.parse(msg.result);
        if (parsed.html && typeof parsed.html === "string" && parsed.html.trim()) {
          return parsed as ComponentResult;
        }
      } catch {
        const match = msg.result.match(/\{[\s\S]*"html"[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.html && typeof parsed.html === "string" && parsed.html.trim()) {
              return parsed as ComponentResult;
            }
          } catch {
            continue;
          }
        }
      }
    }
  }
  return null;
}
```

### Updated orchestrator — use MCP tools

File: `packages/api/src/agents/orchestrator.ts` — update the `createBuilderAgents` function and build loop.

Replace the `createBuilderAgents` function:

```typescript
import { submitComponentTool } from "./tools/submit-component";
import { extractComponentResult, type ComponentResult } from "./component-collector";

function createBuilderAgents(
  plan: DesignPlan,
  sessionId: string
): Record<string, AgentDefinition> {
  const builderPrompt = loadSystemPrompt("builder");
  const agents: Record<string, AgentDefinition> = {};

  for (const component of plan.components) {
    const agentName = `builder-${component.order}`;
    agents[agentName] = {
      description: `Builds the "${component.name}" UI component.`,
      prompt: `${builderPrompt}

## Your Task

Build the "${component.name}" component for a web page.

**Description:** ${component.description}
**Design guidance:** ${component.designGuidance}
**Dimensions:** ${component.width}x${component.height}px

## Instructions

1. Generate beautiful, modern HTML using Tailwind CSS utility classes
2. Call the submit_component tool with your result
3. Use real-sounding content, not placeholders
4. The component must be self-contained and render in an iframe`,
      tools: ["submit_component"],
      model: "sonnet",
    };
  }

  return agents;
}
```

Replace the build loop in the `orchestrate` function (Step 3):

```typescript
  // Step 3: Spawn builder subagents in parallel
  const builderAgents = createBuilderAgents(plan, sessionId);

  const buildPromises = plan.components.map(async (comp, index) => {
    const agentName = `builder-${comp.order}`;
    const componentId = `${comp.order}-${comp.name}`;

    connectionStore.broadcast(sessionId, {
      type: "component:status",
      componentId,
      status: "generating",
    });

    const collectedMessages: SDKMessage[] = [];

    try {
      for await (const message of query({
        prompt: `Use the ${agentName} agent to build the "${comp.name}" component.`,
        options: {
          allowedTools: ["Agent"],
          agents: { [agentName]: builderAgents[agentName] },
          maxTurns: 5,
          mcpServers: [
            {
              name: "avv-tools",
              tools: [submitComponentTool],
            },
          ],
        },
      })) {
        collectedMessages.push(message);
      }

      const result = extractComponentResult(collectedMessages);
      if (result) {
        connectionStore.broadcast(sessionId, {
          type: "component:updated",
          componentId,
          updates: {
            html: result.html,
            css: result.css,
            status: "ready",
          },
        });
      } else {
        connectionStore.broadcast(sessionId, {
          type: "component:status",
          componentId,
          status: "error",
        });
      }
    } catch (err) {
      console.error(`[Agent] Builder ${agentName} failed:`, err);
      connectionStore.broadcast(sessionId, {
        type: "component:status",
        componentId,
        status: "error",
      });
    }
  });

  await Promise.allSettled(buildPromises);
```

### Tailwind CDN in iframe preview

File: `packages/web/src/canvas/shapes/avv-component/ComponentPreview.tsx` (replace existing)

```typescript
import { useMemo } from "react";

interface ComponentPreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
}

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

/**
 * Renders generated HTML/CSS in a sandboxed iframe with Tailwind CSS support.
 * Uses srcDoc to avoid needing allow-same-origin for contentDocument access.
 */
export function ComponentPreview({ html, css, width, height }: ComponentPreviewProps) {
  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${TAILWIND_CDN}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }
      ${css}
    </style>
  </head>
  <body>${html}</body>
</html>`,
    [html, css],
  );

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{
        width,
        height,
        border: "none",
        pointerEvents: "none",
      }}
      title="Component Preview"
    />
  );
}
```

Note: Uses `srcDoc` to set iframe content directly, avoiding the need for `allow-same-origin` (which `contentDocument.write()` would require). The `allow-scripts` sandbox flag enables Tailwind CDN JavaScript execution while `allow-same-origin` is intentionally omitted so preview scripts cannot access the parent page's origin.

### Tools barrel export

File: `packages/api/src/agents/tools/index.ts`

```typescript
export { submitComponentTool } from "./submit-component";
```

File: `packages/api/src/agents/index.ts`

```typescript
export { orchestrate } from "./orchestrator";
export type { OrchestrateOptions } from "./orchestrator";
```

## Testing Strategy

```bash
# Install dependencies
cd packages/api && bun add zod

# Start API
bun run dev

# Generate via REST and monitor WebSocket
# The builder agents should now use submit_component tool
# Verify in server logs that tool calls appear instead of raw JSON text

# Verify Tailwind renders correctly:
# 1. Open http://localhost:5173
# 2. Manually create a component with Tailwind classes in html:
#    e.g., '<div class="bg-blue-500 text-white p-8 rounded-xl">Hello Tailwind</div>'
# 3. Verify blue background renders in the iframe preview
```

## Out of Scope

- Image generation tool (avv-image-agent)
- Component iteration tool (avv-component-iteration)
- Prompt template management UI
- Builder agent A/B testing or quality evaluation
