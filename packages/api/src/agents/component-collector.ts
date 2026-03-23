import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface ComponentResult {
  name: string;
  html: string;
  css: string;
}

/**
 * Extracts component results from agent SDK messages.
 * Looks for submit_component tool results in the message stream.
 */
export function extractComponentResult(messages: SDKMessage[]): ComponentResult | null {
  for (const msg of messages) {
    // Check for tool results containing our component JSON
    const msgAny = msg as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === "tool_result" || block.type === "tool_use") {
          // Try to find submit_component results
          if (block.name === "submit_component" && block.input) {
            return {
              name: block.input.name,
              html: block.input.html,
              css: block.input.css || "",
            };
          }
        }
      }
    }

    // Also check result text as fallback
    if ("result" in msg && typeof msg.result === "string") {
      try {
        const parsed = JSON.parse(msg.result);
        if (parsed.html) return parsed as ComponentResult;
      } catch {
        // Try regex extraction as last resort
        const match = msg.result.match(/\{[\s\S]*"html"[\s\S]*\}/);
        if (match) {
          try {
            return JSON.parse(match[0]) as ComponentResult;
          } catch {
            continue;
          }
        }
      }
    }
  }
  return null;
}
