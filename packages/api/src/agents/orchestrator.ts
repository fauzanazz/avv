import { query, createSdkMcpServer, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DesignPlan, AVVComponent } from "@avv/shared";
import { connectionStore } from "../store";
import { sessionStore } from "../store";
import { enrichPrompt } from "./enricher";
import { loadPrompt } from "./prompt-loader";
import { createRequestImageTool } from "./tools";

/** Track active abort controllers by session ID */
const activeControllers = new Map<string, AbortController>();

export function cancelSession(sessionId: string): void {
  const controller = activeControllers.get(sessionId);
  if (controller) {
    controller.abort();
    activeControllers.delete(sessionId);
  }
}

interface ComponentMapping {
  id: string;
  name: string;
  order: number;
}

function createBuilderAgent(
  comp: DesignPlan["components"][number],
): AgentDefinition {
  const builderPrompt = loadPrompt("builder");

  return {
    description: `Builds the "${comp.name}" UI component. Use this agent when generating the ${comp.name} section.`,
    prompt: `${builderPrompt}

## Your Task

You are building the "${comp.name}" component for a web page.

**Component description:** ${comp.description}
**Design guidance:** ${comp.designGuidance}
**Target dimensions:** ${comp.width}x${comp.height}px

## Output Format

You MUST respond with ONLY a JSON object in this exact format (no markdown, no explanation):

{
  "name": "${comp.name}",
  "html": "<the HTML content>",
  "css": "<the CSS styles>"
}

The HTML should be a self-contained fragment that renders correctly in an iframe.
Use inline Tailwind-style utility classes or write CSS in the css field.
Make it visually polished, modern, and responsive within the given dimensions.
If you need images, use the mcp__image__request_image tool to generate them.`,
    tools: ["mcp__image__request_image"],
    model: "sonnet",
  };
}

/**
 * Extract JSON from LLM response using brace-depth counting
 * instead of a greedy regex that can over-capture.
 */
function extractJsonObject(text: string, requiredKey: string): string | null {
  const keyIndex = text.indexOf(`"${requiredKey}"`);
  if (keyIndex === -1) return null;

  // Walk backwards to find the opening brace
  let start = -1;
  for (let i = keyIndex - 1; i >= 0; i--) {
    if (text[i] === "{") {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  // Walk forward counting brace depth to find the matching close
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
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

function parseComponentFromResponse(text: string): { name: string; html: string; css: string } | null {
  const json = extractJsonObject(text, "html");
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

    // Step 2: Create placeholder components on canvas, storing UUID mappings
    const componentMap: ComponentMapping[] = [];

    for (const comp of plan.components) {
      const componentId = crypto.randomUUID();
      componentMap.push({ id: componentId, name: comp.name, order: comp.order });

      const component: AVVComponent = {
        id: componentId,
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
    const buildPromises = plan.components.map(async (comp) => {
      const agentName = `builder-${comp.order}`;
      const mapping = componentMap.find((m) => m.order === comp.order)!;
      const builderAgent = createBuilderAgent(comp);

      // Create a per-component MCP server with the request_image tool
      // bound to this componentId and session for correct routing
      const imageTool = createRequestImageTool(mapping.id, sessionId);
      const imageServer = createSdkMcpServer({
        name: "image",
        tools: [imageTool],
      });

      connectionStore.broadcast(sessionId, {
        type: "component:status",
        componentId: mapping.id,
        status: "generating",
      });

      let resultText = "";

      try {
        for await (const message of query({
          prompt: `Use the ${agentName} agent to build the "${comp.name}" component.`,
          options: {
            allowedTools: ["Agent"],
            agents: { [agentName]: builderAgent },
            mcpServers: { image: imageServer },
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
            componentId: mapping.id,
            updates: {
              html: parsed.html,
              css: parsed.css,
              status: "ready",
            },
          });
        } else {
          connectionStore.broadcast(sessionId, {
            type: "component:status",
            componentId: mapping.id,
            status: "error",
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        console.error(`[Agent] Builder ${agentName} failed:`, err);
        connectionStore.broadcast(sessionId, {
          type: "component:status",
          componentId: mapping.id,
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
