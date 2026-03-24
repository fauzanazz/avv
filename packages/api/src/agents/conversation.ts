import { query } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { loadPrompt } from "./prompt-loader";

interface ConversationTurn { role: "user" | "assistant"; content: string; }

export interface ConversationState {
  sessionId: string;
  history: ConversationTurn[];
  mode: "simple" | "ultrathink";
  isReady: boolean;
  enrichedPrompt: string;
}

const conversations = new Map<string, ConversationState>();

export function getConversation(sessionId: string): ConversationState | undefined {
  return conversations.get(sessionId);
}

export async function startConversation(sessionId: string, userPrompt: string, mode: "simple" | "ultrathink"): Promise<void> {
  const state: ConversationState = {
    sessionId, history: [{ role: "user", content: userPrompt }], mode, isReady: false, enrichedPrompt: "",
  };
  conversations.set(sessionId, state);

  const modeInstruction = mode === "simple"
    ? "Mode: SIMPLE. Analyze quickly, share brief thinking, then output [READY] with your enriched design brief. Do NOT ask questions — make smart decisions yourself."
    : "Mode: ULTRATHINK. Analyze thoroughly, share thinking, propose 2-3 design options with HTML preview snippets. Ask the user which direction they prefer. Only output [READY] after user confirms.";

  await runAgentTurn(state, modeInstruction);
}

export async function continueConversation(sessionId: string, userMessage: string): Promise<void> {
  const state = conversations.get(sessionId);
  if (!state) return;
  state.history.push({ role: "user", content: userMessage });
  await runAgentTurn(state, "Continue the conversation. If the user has given enough direction, output [READY] with the final design brief.");
}

async function runAgentTurn(state: ConversationState, modeInstruction: string): Promise<void> {
  const systemPrompt = loadPrompt("conversation");
  const { sessionId, history } = state;

  const historyText = history.map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content}`).join("\n\n");

  let fullResponse = "";

  for await (const message of query({
    prompt: `${modeInstruction}\n\n## Conversation:\n\n${historyText}\n\nRespond as the design agent.`,
    options: { systemPrompt, allowedTools: [], maxTurns: 1 },
  })) {
    if ("result" in message && message.result) {
      fullResponse = message.result;
    }
  }

  state.history.push({ role: "assistant", content: fullResponse });
  streamParsedContent(sessionId, fullResponse);

  // Check for READY signal
  if (fullResponse.includes("[READY]")) {
    state.isReady = true;
    const match = fullResponse.match(/\[READY\]([\s\S]*?)(\[\/READY\]|$)/);
    state.enrichedPrompt = match ? match[1].trim() : fullResponse.replace("[READY]", "").trim();
    connectionStore.broadcast(sessionId, { type: "ultrathink:ready", enrichedPrompt: state.enrichedPrompt });
  }
}

/**
 * Parse agent response into structured messages.
 * [THINKING]...[/THINKING] → agent:thinking
 * [OPTION id="x" title="y"]...[/OPTION] → agent:option
 * [READY]...[/READY] → triggers generation
 * Everything else → agent:log
 */
function streamParsedContent(sessionId: string, text: string): void {
  // Thinking blocks
  for (const match of text.matchAll(/\[THINKING\]([\s\S]*?)\[\/THINKING\]/g)) {
    connectionStore.broadcast(sessionId, { type: "agent:thinking", agentId: "designer", thought: match[1].trim() });
  }

  // Option blocks
  for (const match of text.matchAll(/\[OPTION\s+id="([^"]+)"\s+title="([^"]+)"\]([\s\S]*?)\[\/OPTION\]/g)) {
    const content = match[3].trim();
    const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
    connectionStore.broadcast(sessionId, {
      type: "agent:option", agentId: "designer", optionId: match[1], title: match[2],
      description: content.replace(/```html[\s\S]*?```/, "").trim(),
      previewHtml: htmlMatch?.[1]?.trim(),
    });
  }

  // Clean text (strip markers)
  const clean = text
    .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/g, "")
    .replace(/\[OPTION[\s\S]*?\[\/OPTION\]/g, "")
    .replace(/\[READY\][\s\S]*?(\[\/READY\]|$)/g, "")
    .trim();
  if (clean) {
    connectionStore.broadcast(sessionId, { type: "agent:log", agentId: "designer", message: clean });
  }
}
