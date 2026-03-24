import { query, createSdkMcpServer, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { extractComponentResult } from "./component-collector";
import { loadPrompt } from "./prompt-loader";
import { submitComponentTool } from "./tools/submit-component";

export interface IterateOptions {
  sessionId: string;
  componentId: string;
  componentName: string;
  currentHtml: string;
  currentCss: string;
  instruction: string;
  iteration: number;
}

/**
 * Iterates on a single component by spawning a builder with the current HTML
 * and the user's refinement instruction.
 */
export async function iterateComponent({
  sessionId,
  componentId,
  componentName,
  currentHtml,
  currentCss,
  instruction,
  iteration,
}: IterateOptions): Promise<void> {
  const builderPrompt = loadPrompt("builder");

  connectionStore.broadcast(sessionId, {
    type: "component:status",
    componentId,
    status: "generating",
  });

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "iterator",
    message: `Iterating on "${componentName}": ${instruction}`,
  });

  const iteratorAgent: AgentDefinition = {
    description: `Iterates on the "${componentName}" component based on user feedback.`,
    prompt: `${builderPrompt}

## Your Task

You are refining an existing UI component called "${componentName}".
This is iteration #${iteration + 1}.

## Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

## Current CSS:
\`\`\`css
${currentCss}
\`\`\`

## User's instruction:
"${instruction}"

## Rules:
- Modify the existing HTML/CSS to match the user's instruction
- Keep everything else the same unless the instruction implies broader changes
- Call the submit_component tool with the updated result
- Maintain the same quality and structure`,
    tools: ["submit_component"],
    model: "sonnet",
  };

  const collectedMessages: any[] = [];

  try {
    for await (const message of query({
      prompt: `Use the iterator agent to refine the "${componentName}" component. The user says: "${instruction}"`,
      options: {
        allowedTools: ["Agent"],
        agents: { iterator: iteratorAgent },
        maxTurns: 5,
        mcpServers: {
          "avv-tools": createSdkMcpServer({
            name: "avv-tools",
            tools: [submitComponentTool],
          }),
        },
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
          iteration: iteration + 1,
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
    console.error(`[Iterator] Failed:`, err);
    connectionStore.broadcast(sessionId, {
      type: "component:status",
      componentId,
      status: "error",
    });
  }
}
