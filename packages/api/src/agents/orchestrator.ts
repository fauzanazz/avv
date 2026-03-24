import { query, createSdkMcpServer, type SDKMessage, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DesignPlan, AVVComponent } from "@avv/shared";
import { connectionStore } from "../store";
import { sessionStore } from "../store";
import { enrichPrompt } from "./enricher";
import { loadPrompt } from "./prompt-loader";
import { createRequestImageTool } from "./tools";
import { submitComponentTool } from "./tools/submit-component";
import { extractComponentResult } from "./component-collector";

/** Track active abort controllers by session ID */
const activeControllers = new Map<string, AbortController>();

export function cancelSession(sessionId: string): void {
  const controller = activeControllers.get(sessionId);
  if (controller) {
    controller.abort();
    activeControllers.delete(sessionId);
  }
}

function createBuilderAgent(
  comp: DesignPlan["components"][number],
): AgentDefinition {
  const builderPrompt = loadPrompt("builder");

  return {
    description: `Builds the "${comp.name}" UI component. Use this agent when generating the ${comp.name} section.`,
    prompt: `${builderPrompt}

## Your Task

Build the "${comp.name}" component for a web page.

**Description:** ${comp.description}
**Design guidance:** ${comp.designGuidance}
**Dimensions:** ${comp.width}x${comp.height}px

## Instructions

1. Generate beautiful, modern HTML using Tailwind CSS utility classes
2. Call the submit_component tool with your result
3. Use real-sounding content, not placeholders
4. The component must be self-contained and render in an iframe`,
    tools: ["submit_component"],
    model: "sonnet",
  };
}

/**
 * Extract JSON from LLM response using brace-depth counting
 * instead of a greedy regex that can over-capture.
 * Skips braces inside JSON string literals to avoid premature termination.
 */
function extractJsonObject(text: string, requiredKey: string): string | null {
  const keyIndex = text.indexOf(`"${requiredKey}"`);
  if (keyIndex === -1) return null;

  let start = -1;
  for (let i = keyIndex - 1; i >= 0; i--) {
    if (text[i] === "{") {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (ch === "\\") {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function parsePlanFromResponse(text: string): DesignPlan | null {
  const json = extractJsonObject(text, "components");
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (!parsed.components || !Array.isArray(parsed.components)) return null;
    return parsed as DesignPlan;
  } catch {
    return null;
  }
}

export interface OrchestrateOptions {
  prompt: string;
  mode: "simple" | "ultrathink";
  sessionId: string;
}

export async function orchestrate({ prompt, mode, sessionId }: OrchestrateOptions): Promise<void> {
  let finalPrompt = prompt;

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

  const orchestratorPrompt = loadPrompt("orchestrator");
  const abortController = new AbortController();
  activeControllers.set(sessionId, abortController);

  const checkAborted = () => {
    if (abortController.signal.aborted) {
      throw new DOMException("Orchestration cancelled", "AbortError");
    }
  };

  try {
    sessionStore.update(sessionId, { status: "generating" });

    connectionStore.broadcast(sessionId, {
      type: "agent:log",
      agentId: "orchestrator",
      message: "Analyzing prompt and creating component plan...",
    });

    let planText = "";

    for await (const message of query({
      prompt: `## User Request

"${finalPrompt}"

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
      checkAborted();
      if ("result" in message) {
        planText = message.result;
      }
    }

    checkAborted();

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

    // Step 2: Create placeholder components on canvas, build name->id map
    const nameToId = new Map<string, string>();
    for (const comp of plan.components) {
      const id = crypto.randomUUID();
      nameToId.set(comp.name, id);
      const component: AVVComponent = {
        id,
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

    checkAborted();

    // Step 3: Spawn builder subagents in parallel
    const sortedComponents = [...plan.components].sort((a, b) => a.order - b.order);

    const mcpServer = createSdkMcpServer({
      name: "avv-tools",
      tools: [submitComponentTool],
    });

    const buildPromises = sortedComponents.map(async (comp) => {
      const agentName = `builder-${comp.order}`;
      const componentId = nameToId.get(comp.name)!;
      const builderAgent = createBuilderAgent(comp);

      const imageTool = createRequestImageTool(componentId, sessionId);
      const imageServer = createSdkMcpServer({
        name: "avv-image",
        tools: [imageTool],
      });

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
            allowedTools: ["Agent", "mcp__avv-image__request_image"],
            agents: { [agentName]: builderAgent },
            mcpServers: { "avv-image": imageServer, "avv-tools": mcpServer },
            maxTurns: 5,
          },
        })) {
          checkAborted();
          collectedMessages.push(message);
        }

        checkAborted();

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
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        console.error(`[Agent] Builder ${agentName} failed:`, err);
        connectionStore.broadcast(sessionId, {
          type: "component:status",
          componentId,
          status: "error",
        });
      }
    });

    await Promise.allSettled(buildPromises);

    checkAborted();

    // Step 4: Mark session as done
    sessionStore.update(sessionId, { status: "done" });
    connectionStore.broadcast(sessionId, {
      type: "generation:done",
      sessionId,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      sessionStore.update(sessionId, { status: "error" });
      connectionStore.broadcast(sessionId, {
        type: "error",
        message: "Generation cancelled",
      });
    } else {
      throw err;
    }
  } finally {
    activeControllers.delete(sessionId);
  }
}
