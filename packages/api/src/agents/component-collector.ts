import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface ComponentResult {
  name: string;
  html: string;
  css: string;
}

/**
 * Extracts component results from agent SDK messages.
 * Iterates in reverse to return the agent's final submission,
 * not an intermediate draft.
 */
export function extractComponentResult(messages: SDKMessage[]): ComponentResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    // Check for tool results containing our component JSON
    const msgAny = msg as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === "tool_result" || block.type === "tool_use") {
          if (block.name === "submit_component" && block.input) {
            const html = block.input.html;
            // Validate: only accept if html is a non-empty string
            if (typeof html !== "string" || !html.trim()) {
              continue;
            }
            return {
              name: block.input.name,
              html,
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
        if (parsed.html && typeof parsed.html === "string" && parsed.html.trim()) {
          return parsed as ComponentResult;
        }
      } catch {
        const match = msg.result.match(/\{[\s\S]*"html"[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.html && typeof parsed.html === "string" && parsed.html.trim()) {
              return parsed as ComponentResult;
            }
          } catch {
            continue;
          }
        }
      }
    }
  }
  return null;
}
