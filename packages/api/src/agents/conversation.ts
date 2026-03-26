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

export function deleteConversation(sessionId: string): void {
  conversations.delete(sessionId);
}

export async function startConversation(sessionId: string, userPrompt: string, mode: "simple" | "ultrathink"): Promise<boolean> {
  const state: ConversationState = {
    sessionId, history: [{ role: "user", content: userPrompt }], mode, isReady: false, enrichedPrompt: "",
  };
  conversations.set(sessionId, state);

  const modeInstruction = mode === "simple"
    ? "Mode: SIMPLE. Analyze quickly, share brief thinking, then output [READY] with your enriched design brief. Do NOT ask questions — make smart decisions yourself."
    : "Mode: ULTRATHINK. Analyze thoroughly, share thinking, propose 2-3 design options with HTML preview snippets. Ask the user which direction they prefer. Only output [READY] after user confirms.";

  await runAgentTurn(state, modeInstruction);
  return state.isReady;
}

export async function continueConversation(sessionId: string, userMessage: string): Promise<boolean> {
  const state = conversations.get(sessionId);
  if (!state) return false;
  state.history.push({ role: "user", content: userMessage });

  const modeInstruction = state.mode === "ultrathink"
    ? "Mode: ULTRATHINK continuation. The user is responding to the design options you presented above. Interpret their reply in context of the full conversation — if they picked an option (e.g. 'A', 'B', '1', '2', or described a preference), acknowledge their choice, elaborate on that direction, and output [READY] with the final enriched design brief. If they asked a follow-up question, answer it and ask if they're ready to proceed."
    : "Mode: SIMPLE continuation. The user is responding to your previous message. Interpret their reply in context of the full conversation above. If they made a choice or gave direction, output [READY] with the final enriched design brief incorporating their feedback. Do not treat their message in isolation — it is a reply to what you said above.";

  await runAgentTurn(state, modeInstruction);
  return state.isReady;
}

async function runAgentTurn(state: ConversationState, modeInstruction: string): Promise<void> {
  const systemPrompt = loadPrompt("conversation");
  const { sessionId, history } = state;

  const historyText = history.map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content}`).join("\n\n");

  const isFirstTurn = history.filter((t) => t.role === "user").length === 1;
  const contextNote = isFirstTurn
    ? ""
    : "\n\nIMPORTANT: This is a multi-turn conversation. The user's latest message is a REPLY to your previous message. Read the full conversation history above before responding.\n";

  let fullResponse = "";

  for await (const message of query({
    prompt: `${modeInstruction}${contextNote}\n\n## Conversation History:\n\n${historyText}\n\nRespond as the design agent. Base your response on the FULL conversation above.`,
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
