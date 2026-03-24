import { query, createSdkMcpServer, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { planStore } from "../store/plan-store";
import { loadPrompt } from "./prompt-loader";
import { submitComponentTool } from "./tools/submit-component";
import { extractComponentResult } from "./component-collector";

const MAX_RETRIES = 3;
const retryCounts = new Map<string, number>();

export async function retrySection(sessionId: string, pageId: string, sectionId: string): Promise<void> {
  const count = (retryCounts.get(sectionId) ?? 0) + 1;
  if (count > MAX_RETRIES) {
    connectionStore.broadcast(sessionId, { type: "error", message: `Max retries (${MAX_RETRIES}) reached.` });
    return;
  }
  retryCounts.set(sectionId, count);

  const plan = planStore.get(pageId, sectionId);
  if (!plan) {
    connectionStore.broadcast(sessionId, { type: "error", message: "Original plan not found — re-generate the page." });
    return;
  }

  connectionStore.broadcast(sessionId, { type: "component:status", componentId: sectionId, status: "generating" });
  connectionStore.broadcast(sessionId, { type: "agent:log", agentId: "retrier", message: `Retrying "${plan.name}" (${count}/${MAX_RETRIES})...` });

  const mcpServer = createSdkMcpServer({ name: "avv-tools", tools: [submitComponentTool] });
  const collected: SDKMessage[] = [];

  try {
    for await (const msg of query({
      prompt: `Build the "${plan.name}" section.\n\n**Description:** ${plan.description}\n**Design:** ${plan.designGuidance}\n\nThis is retry attempt ${count}. Generate clean HTML. Call mcp__avv-tools__submit_component with result.`,
      options: {
        systemPrompt: loadPrompt("builder"),
        allowedTools: ["mcp__avv-tools__submit_component"],
        mcpServers: { "avv-tools": mcpServer },
        maxTurns: 5,
      },
    })) { collected.push(msg); }

    const result = extractComponentResult(collected);
    if (result) {
      connectionStore.broadcast(sessionId, {
        type: "component:updated", componentId: sectionId,
        updates: { html: result.html, css: result.css, status: "ready" },
      });
    } else {
      connectionStore.broadcast(sessionId, { type: "component:status", componentId: sectionId, status: "error" });
    }
  } catch (err) {
    console.error("[Retrier] Failed:", err);
    connectionStore.broadcast(sessionId, { type: "component:status", componentId: sectionId, status: "error" });
  }
}
