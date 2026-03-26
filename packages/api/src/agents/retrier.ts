import { query, createSdkMcpServer, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ComponentVariant } from "@avv/shared";
import { connectionStore } from "../store";
import { planStore } from "../store/plan-store";
import { loadPrompt } from "./prompt-loader";
import { submitComponentTool } from "./tools/submit-component";
import { extractComponentResult } from "./component-collector";

const MAX_RETRIES = 3;
const retryCounts = new Map<string, number>();

function makeRetryKey(sessionId: string, componentId: string): string {
  return `${sessionId}:${componentId}`;
}

export async function retryComponent(wsSessionId: string, sessionId: string, componentId: string): Promise<void> {
  const key = makeRetryKey(sessionId, componentId);
  const currentCount = retryCounts.get(key) ?? 0;

  if (currentCount >= MAX_RETRIES) {
    connectionStore.broadcast(wsSessionId, { type: "error", message: `Max retries (${MAX_RETRIES}) reached.` });
    return;
  }

  const plan = planStore.get(sessionId, componentId);
  if (!plan) {
    connectionStore.broadcast(wsSessionId, { type: "error", message: "Original plan not found — re-generate the page." });
    return;
  }

  const count = currentCount + 1;
  retryCounts.set(key, count);

  connectionStore.broadcast(wsSessionId, { type: "component:status", sessionId, componentId, status: "generating" });
  connectionStore.broadcast(wsSessionId, { type: "agent:log", agentId: "retrier", message: `Retrying "${plan.name}" (${count}/${MAX_RETRIES})...` });

  const mcpServer = createSdkMcpServer({ name: "avv-tools", tools: [submitComponentTool] });
  const collected: SDKMessage[] = [];

  try {
    for await (const msg of query({
      prompt: `Build the "${plan.name}" component.\n\n**Description:** ${plan.description}\n**Design:** ${plan.designGuidance}\n\nThis is retry attempt ${count}. Generate clean HTML. Call mcp__avv-tools__submit_component with result.`,
      options: {
        systemPrompt: loadPrompt("builder"),
        allowedTools: ["mcp__avv-tools__submit_component"],
        mcpServers: { "avv-tools": mcpServer },
        maxTurns: 5,
      },
    })) { collected.push(msg); }

    const result = extractComponentResult(collected);
    if (result) {
      retryCounts.delete(key);
      const variant: ComponentVariant = {
        id: crypto.randomUUID(),
        html: result.html,
        css: result.css,
        label: "v1",
        createdAt: new Date().toISOString(),
      };
      connectionStore.broadcast(wsSessionId, {
        type: "component:updated",
        sessionId,
        componentId,
        updates: { variants: [variant], status: "ready" },
      });
    } else {
      connectionStore.broadcast(wsSessionId, { type: "component:status", sessionId, componentId, status: "error" });
    }
  } catch (err) {
    console.error("[Retrier] Failed:", err);
    connectionStore.broadcast(wsSessionId, { type: "component:status", sessionId, componentId, status: "error" });
  }
}
