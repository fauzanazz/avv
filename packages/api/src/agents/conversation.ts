import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
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

/**
 * Extract text content from an SDK assistant message's content blocks.
 * Filters to only text-type blocks and joins them, avoiding [object Object]
 * from thinking/tool_use blocks that lack a `.text` property.
 */
function extractTextFromAssistantMessage(message: SDKMessage): string | null {
  if (message.type !== "assistant" || !("message" in message)) return null;
  const msg = (message as { message: { content: unknown[] } }).message;
  if (!msg?.content || !Array.isArray(msg.content)) return null;
  return msg.content
    .filter((block: unknown) => {
      const b = block as { type?: string; text?: string };
      return b.type === "text" && typeof b.text === "string";
    })
    .map((block: unknown) => (block as { text: string }).text)
    .join("\n");
}

/**
 * Sanitize a response string by removing [object Object] artifacts
 * that may leak from SDK content-block serialization.
 */
function sanitizeResponse(text: string): string {
  return text.replace(/\[object Object\]/g, "").replace(/\s{3,}/g, "\n\n");
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

  const modeInstruction = "Analyze the user's request quickly, share brief thinking about the design direction, then output [READY] with your enriched design brief. Do NOT ask questions — make smart design decisions yourself. The design system generator will handle colors, fonts, and spacing.";

  await runAgentTurn(state, modeInstruction);
  return state.isReady;
}

export async function continueConversation(sessionId: string, userMessage: string): Promise<boolean> {
  const state = conversations.get(sessionId);
  if (!state) return false;
  state.history.push({ role: "user", content: userMessage });

  const modeInstruction = "The user is responding to your previous message. Interpret their reply in context of the full conversation above. If they made a choice or gave direction, output [READY] with the final enriched design brief incorporating their feedback. Do not treat their message in isolation — it is a reply to what you said above.";

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
  let assistantText = "";

  for await (const message of query({
    prompt: `${modeInstruction}${contextNote}\n\n## Conversation History:\n\n${historyText}\n\nRespond as the design agent. Base your response on the FULL conversation above.`,
    options: { systemPrompt, allowedTools: [], maxTurns: 1 },
  })) {
    const extracted = extractTextFromAssistantMessage(message);
    if (extracted) assistantText = extracted;
    if ("result" in message && message.result) {
      fullResponse = typeof message.result === "string" ? message.result : String(message.result);
    }
  }

  // Prefer SDK result, but fall back to assistant message text if result
  // contains [object Object] artifacts from content-block serialization
  if (fullResponse.includes("[object Object]") && assistantText) {
    fullResponse = assistantText;
  } else if (fullResponse.includes("[object Object]")) {
    fullResponse = sanitizeResponse(fullResponse);
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
