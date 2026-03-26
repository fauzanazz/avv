import { query, createSdkMcpServer, type SDKMessage, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DesignPlan, ViewerComponent, GenerationSession, ComponentVariant } from "@avv/shared";
import { connectionStore } from "../store";
import { sessionStore } from "../store";
import { planStore } from "../store/plan-store";
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
  component: DesignPlan["components"][number],
): AgentDefinition {
  const builderPrompt = loadPrompt("builder");

  return {
    description: `Builds the "${component.name}" UI component. Use this agent when generating the ${component.name} component.`,
    prompt: `${builderPrompt}

## Your Task

Build the "${component.name}" component for a web page.

**Description:** ${component.description}
**Design guidance:** ${component.designGuidance}

## Instructions

1. Generate beautiful, modern HTML using Tailwind CSS utility classes
2. Call the submit_component tool with your result
3. Use real-sounding content, not placeholders
4. The component must render correctly when placed in a full page with other components
5. Use full-width layout (width: 100%) — the page container handles sizing`,
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
  const finalPrompt = prompt;
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
      "designGuidance": "Specific design instructions for this component"
    }
  ]
}

Components are rendered vertically in document flow. CSS handles layout, not canvas coordinates.`,
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

    // Step 2: Create a generation session with pending components
    const genSessionId = crypto.randomUUID();
    const components: ViewerComponent[] = plan.components.map((s) => ({
      id: crypto.randomUUID(),
      name: s.name,
      status: "pending" as const,
      variants: [],
      prompt: s.designGuidance,
      agentId: `builder-${s.order}`,
      iteration: 0,
      order: s.order,
    }));

    const session: GenerationSession = {
      id: genSessionId,
      title: plan.title,
      status: "generating",
      components,
      prompt: finalPrompt,
      mode,
      createdAt: new Date().toISOString(),
    };

    connectionStore.broadcast(sessionId, { type: "generation:created", session });

    // Save plans for retry support — match by array index (components derived 1:1 from plan.components)
    for (let i = 0; i < plan.components.length; i++) {
      planStore.save(genSessionId, components[i].id, plan.components[i]);
    }

    checkAborted();

    // Step 3: Spawn builder subagents in parallel
    // Map plan components to viewer components by array index (1:1 from the same .map() call)
    const planToComponent = new Map(plan.components.map((cp, i) => [cp, components[i]]));

    const mcpServer = createSdkMcpServer({
      name: "avv-tools",
      tools: [submitComponentTool],
    });

    const buildPromises = plan.components.map(async (componentPlan) => {
      const component = planToComponent.get(componentPlan)!;
      const agentName = `builder-${componentPlan.order}`;
      const builderAgent = createBuilderAgent(componentPlan);

      const imageTool = createRequestImageTool(component.id, genSessionId, sessionId);
      const imageServer = createSdkMcpServer({
        name: "avv-image",
        tools: [imageTool],
      });

      connectionStore.broadcast(sessionId, {
        type: "component:status",
        sessionId: genSessionId,
        componentId: component.id,
        status: "generating",
      });

      const collectedMessages: SDKMessage[] = [];

      try {
        for await (const message of query({
          prompt: `Use the ${agentName} agent to build the "${componentPlan.name}" component.`,
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
          const variant: ComponentVariant = {
            id: crypto.randomUUID(),
            html: result.html,
            css: result.css,
            label: "v1",
            createdAt: new Date().toISOString(),
          };

          connectionStore.broadcast(sessionId, {
            type: "component:updated",
            sessionId: genSessionId,
            componentId: component.id,
            updates: {
              variants: [variant],
              status: "ready",
            },
          });
        } else {
          connectionStore.broadcast(sessionId, {
            type: "component:status",
            sessionId: genSessionId,
            componentId: component.id,
            status: "error",
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        console.error(`[Agent] Builder ${agentName} failed:`, err);
        connectionStore.broadcast(sessionId, {
          type: "component:status",
          sessionId: genSessionId,
          componentId: component.id,
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
      sessionId: genSessionId,
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
