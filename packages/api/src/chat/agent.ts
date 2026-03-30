import { query, type Query, type SDKMessage, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { ServerMessage } from "@avv/shared";

export interface AgentSession {
  query: Query;
  abort: AbortController;
  conversationId: string;
}

const activeSessions = new Map<string, AgentSession>();

export interface RunAgentOptions {
  conversationId: string;
  prompt: string;
  systemPrompt?: string;
  onMessage: (msg: ServerMessage) => void;
  cwd?: string;
  maxTurns?: number;
}

/**
 * Run a Claude Agent SDK query and stream results as ServerMessages.
 * Returns the full assistant text when done.
 */
export async function runAgent({
  conversationId,
  prompt,
  systemPrompt,
  onMessage,
  cwd,
  maxTurns,
}: RunAgentOptions): Promise<string> {
  const abort = new AbortController();

  const options: Options = {
    abortController: abort,
    includePartialMessages: true,
    persistSession: false,
    cwd: cwd ?? process.cwd(),
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(maxTurns ? { maxTurns } : {}),
  };

  const q = query({ prompt, options });

  const session: AgentSession = { query: q, abort, conversationId };
  activeSessions.set(conversationId, session);

  let fullText = "";
  let sentDone = false;

  try {
    for await (const msg of q) {
      if (abort.signal.aborted) break;

      const mapped = mapSdkMessage(msg, conversationId);
      if (!mapped) continue;

      for (const serverMsg of mapped) {
        if (serverMsg.type === "chat:text" && !serverMsg.streaming) {
          fullText += serverMsg.content;
        }
        if (serverMsg.type === "chat:done") {
          sentDone = true;
        }
        onMessage(serverMsg);
      }
    }
  } catch (err: unknown) {
    if (!abort.signal.aborted) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      onMessage({
        type: "chat:error",
        conversationId,
        error: errorMsg,
      });
    }
  } finally {
    activeSessions.delete(conversationId);
    if (!sentDone) {
      onMessage({ type: "chat:done", conversationId, messageId: "" });
    }
  }

  return fullText;
}

/**
 * Cancel a running agent session.
 */
export function cancelAgent(conversationId: string): void {
  const session = activeSessions.get(conversationId);
  if (session) {
    session.abort.abort();
    session.query.close();
    activeSessions.delete(conversationId);
  }
}

/**
 * Check if there's an active agent session for a conversation.
 */
export function isAgentRunning(conversationId: string): boolean {
  return activeSessions.has(conversationId);
}

// ── SDK Message Mapping ──────────────────────────────────────

// Track pending tool calls so we can mark them completed
const pendingToolCalls = new Map<string, Set<string>>(); // conversationId -> Set<callId>

function mapSdkMessage(
  msg: SDKMessage,
  conversationId: string,
): ServerMessage[] | null {
  switch (msg.type) {
    case "assistant": {
      const results: ServerMessage[] = [];

      // Mark all previously pending tool calls as completed
      // (a new assistant message means tools finished executing)
      const pending = pendingToolCalls.get(conversationId);
      if (pending && pending.size > 0) {
        for (const callId of pending) {
          results.push({
            type: "chat:tool_call",
            conversationId,
            callId,
            tool: "",
            args: {},
            status: "completed",
          });
        }
        pending.clear();
      }

      for (const block of msg.message.content) {
        if (block.type === "text") {
          results.push({
            type: "chat:text",
            conversationId,
            content: block.text,
            streaming: false,
          });
        } else if (block.type === "thinking") {
          results.push({
            type: "chat:thinking",
            conversationId,
            content: block.thinking,
          });
        } else if (block.type === "tool_use") {
          // Track this tool call as pending
          if (!pendingToolCalls.has(conversationId)) {
            pendingToolCalls.set(conversationId, new Set());
          }
          pendingToolCalls.get(conversationId)!.add(block.id);

          results.push({
            type: "chat:tool_call",
            conversationId,
            callId: block.id,
            tool: block.name,
            args: block.input as Record<string, unknown>,
            status: "running",
          });
        }
      }

      return results.length > 0 ? results : null;
    }

    case "stream_event": {
      const event = msg.event;

      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          return [{
            type: "chat:text",
            conversationId,
            content: event.delta.text,
            streaming: true,
          }];
        }
        if (event.delta.type === "thinking_delta") {
          return [{
            type: "chat:thinking",
            conversationId,
            content: event.delta.thinking,
          }];
        }
      }

      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          return [{
            type: "chat:tool_call",
            conversationId,
            callId: event.content_block.id,
            tool: event.content_block.name,
            args: {},
            status: "pending",
          }];
        }
      }

      return null;
    }

    case "tool_progress": {
      // Tool is still running — update status
      return [{
        type: "chat:tool_call",
        conversationId,
        callId: msg.tool_use_id,
        tool: msg.tool_name,
        args: {},
        status: "running",
      }];
    }

    case "tool_use_summary": {
      // Mark preceding tool calls as completed
      const completions: ServerMessage[] = [];
      for (const callId of msg.preceding_tool_use_ids) {
        pendingToolCalls.get(conversationId)?.delete(callId);
        completions.push({
          type: "chat:tool_call",
          conversationId,
          callId,
          tool: "",
          args: {},
          status: "completed",
        });
      }
      return completions.length > 0 ? completions : null;
    }

    case "result": {
      // Final query result — mark all remaining pending tools as completed
      const finalCompletions: ServerMessage[] = [];
      const remaining = pendingToolCalls.get(conversationId);
      if (remaining) {
        for (const callId of remaining) {
          finalCompletions.push({
            type: "chat:tool_call",
            conversationId,
            callId,
            tool: "",
            args: {},
            status: "completed",
          });
        }
        pendingToolCalls.delete(conversationId);
      }

      if (msg.subtype === "success") {
        finalCompletions.push({
          type: "chat:done",
          conversationId,
          messageId: msg.uuid,
        });
        return finalCompletions;
      }
      finalCompletions.push({
        type: "chat:error",
        conversationId,
        error: msg.errors?.join(", ") || "Agent execution failed",
      });
      return finalCompletions;
    }

    case "user": {
      // User message replay (contains tool results)
      if (msg.tool_use_result && msg.parent_tool_use_id) {
        const resultStr = typeof msg.tool_use_result === "string"
          ? msg.tool_use_result
          : JSON.stringify(msg.tool_use_result);
        return [{
          type: "chat:tool_call",
          conversationId,
          callId: msg.parent_tool_use_id,
          tool: "",
          args: {},
          result: resultStr.slice(0, 2000), // Truncate large results
          status: "completed",
        }];
      }
      return null;
    }

    case "system": {
      return null;
    }

    default:
      return null;
  }
}
