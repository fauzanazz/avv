import { query, createSdkMcpServer, type SDKMessage, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DesignPlan, AVVPage, PageSection } from "@avv/shared";
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
  section: DesignPlan["sections"][number],
): AgentDefinition {
  const builderPrompt = loadPrompt("builder");

  return {
    description: `Builds the "${section.name}" UI section. Use this agent when generating the ${section.name} section.`,
    prompt: `${builderPrompt}

## Your Task

Build the "${section.name}" section for a web page.

**Description:** ${section.description}
**Design guidance:** ${section.designGuidance}

## Instructions

1. Generate beautiful, modern HTML using Tailwind CSS utility classes
2. Call the submit_component tool with your result
3. Use real-sounding content, not placeholders
4. The section must render correctly when placed in a full page with other sections
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
  const json = extractJsonObject(text, "sections");
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (!parsed.sections || !Array.isArray(parsed.sections)) return null;
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
      message: "Analyzing prompt and creating section plan...",
    });

    let planText = "";

    for await (const message of query({
      prompt: `## User Request

"${finalPrompt}"

## Mode: ${mode}

Decompose this into a section plan. Respond with ONLY a JSON object in DesignPlan format:

{
  "title": "Page title",
  "summary": "Brief summary of the design approach",
  "sections": [
    {
      "name": "Section Name",
      "description": "What this section does",
      "htmlTag": "section",
      "order": 0,
      "designGuidance": "Specific design instructions for this section"
    }
  ]
}

Sections are rendered vertically in document flow. CSS handles layout, not canvas coordinates.`,
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
        message: "Failed to generate section plan",
      });
      sessionStore.update(sessionId, { status: "error" });
      return;
    }

    connectionStore.broadcast(sessionId, {
      type: "agent:log",
      agentId: "orchestrator",
      message: `Plan created: ${plan.sections.length} sections to build`,
    });

    // Step 2: Create a single page with pending sections
    const pageId = crypto.randomUUID();
    const sections: PageSection[] = plan.sections.map((s) => ({
      id: crypto.randomUUID(),
      name: s.name,
      status: "pending" as const,
      html: "",
      css: "",
      prompt: s.designGuidance,
      agentId: `builder-${s.order}`,
      iteration: 0,
      order: s.order,
    }));

    const page: AVVPage = {
      id: pageId,
      title: plan.title,
      status: "generating",
      sections,
      prompt: finalPrompt,
      mode,
      createdAt: new Date().toISOString(),
    };

    connectionStore.broadcast(sessionId, { type: "page:created", page });

    // Save plans for retry support
    for (const comp of plan.components) {
      const id = nameToId.get(comp.name);
      if (id) planStore.save(sessionId, id, comp);
    }

    checkAborted();

    // Step 3: Spawn builder subagents in parallel
    const sortedSections = [...plan.sections].sort((a, b) => a.order - b.order);

    const mcpServer = createSdkMcpServer({
      name: "avv-tools",
      tools: [submitComponentTool],
    });

    const buildPromises = sortedSections.map(async (sectionPlan) => {
      const section = sections.find((s) => s.name === sectionPlan.name)!;
      const agentName = `builder-${sectionPlan.order}`;
      const builderAgent = createBuilderAgent(sectionPlan);

      const imageTool = createRequestImageTool(section.id, pageId, sessionId);
      const imageServer = createSdkMcpServer({
        name: "avv-image",
        tools: [imageTool],
      });

      connectionStore.broadcast(sessionId, {
        type: "section:status",
        pageId,
        sectionId: section.id,
        status: "generating",
      });

      const collectedMessages: SDKMessage[] = [];

      try {
        for await (const message of query({
          prompt: `Use the ${agentName} agent to build the "${sectionPlan.name}" section.`,
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
            type: "section:updated",
            pageId,
            sectionId: section.id,
            updates: {
              html: result.html,
              css: result.css,
              status: "ready",
            },
          });
        } else {
          connectionStore.broadcast(sessionId, {
            type: "section:status",
            pageId,
            sectionId: section.id,
            status: "error",
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        console.error(`[Agent] Builder ${agentName} failed:`, err);
        connectionStore.broadcast(sessionId, {
          type: "section:status",
          pageId,
          sectionId: section.id,
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
