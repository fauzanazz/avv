import { query, createSdkMcpServer, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DesignPlan, AVVComponent, ImageResult } from "@avv/shared";
import { connectionStore } from "../store";
import { sessionStore } from "../store";
import { enrichPrompt } from "./enricher";
import { loadPrompt } from "./prompt-loader";
import { createRequestImageTool } from "./tools";
import { imageQueue } from "./image-queue";

/** Track active abort controllers by session ID */
const activeControllers = new Map<string, AbortController>();

export function cancelSession(sessionId: string): void {
  const controller = activeControllers.get(sessionId);
  if (controller) {
    controller.abort();
    activeControllers.delete(sessionId);
  }
}

function createBuilderAgents(
  plan: DesignPlan
): Record<string, AgentDefinition> {
  const builderPrompt = loadPrompt("builder");
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
 * Extracts the first valid JSON object from a string using balanced-brace counting.
 * Avoids greedy regex issues where trailing text corrupts the match.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parsePlanFromResponse(text: string): DesignPlan | null {
  const json = extractJsonObject(text);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (!parsed.components || !Array.isArray(parsed.components)) return null;
    return parsed as DesignPlan;
  } catch {
    return null;
  }
}

function parseComponentFromResponse(text: string): { name: string; html: string; css: string } | null {
  const json = extractJsonObject(text);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (typeof parsed.html !== "string") return null;
    return parsed;
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

    // Step 1: Generate the component plan
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

    // Step 2: Create placeholder components on canvas with stable UUIDs
    const componentIds = new Map<number, string>();
    for (const comp of plan.components) {
      const id = crypto.randomUUID();
      componentIds.set(comp.order, id);

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
    const builderAgents = createBuilderAgents(plan);

    // Wire image queue to broadcast results via WebSocket
    imageQueue.onResult = (result: ImageResult) => {
      connectionStore.broadcast(sessionId, {
        type: "image:ready",
        image: result,
      });
    };

    const buildPromises = plan.components.map(async (comp) => {
      const agentName = `builder-${comp.order}`;
      const componentId = componentIds.get(comp.order)!;

      connectionStore.broadcast(sessionId, {
        type: "component:status",
        componentId,
        status: "generating",
      });

      const onImageResult = (result: ImageResult) => {
        connectionStore.broadcast(sessionId, {
          type: "image:ready",
          image: result,
        });
      };

      const imageToolDef = createRequestImageTool(comp.name, onImageResult);
      const imageServer = createSdkMcpServer({
        name: "avv-image",
        tools: [imageToolDef],
      });

      let resultText = "";

      try {
        for await (const message of query({
          prompt: `Use the ${agentName} agent to build the "${comp.name}" component.`,
          options: {
            allowedTools: ["Agent", "mcp__avv-image__request_image"],
            agents: { [agentName]: builderAgents[agentName] },
            mcpServers: { "avv-image": imageServer },
            maxTurns: 3,
          },
        })) {
          checkAborted();
          if ("result" in message) {
            resultText = message.result;
          }
        }

        checkAborted();

        const parsed = parseComponentFromResponse(resultText);
        if (parsed) {
          connectionStore.broadcast(sessionId, {
            type: "component:updated",
            componentId,
            updates: {
              html: parsed.html,
              css: parsed.css,
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
