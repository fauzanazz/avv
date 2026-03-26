import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface ComponentResult {
  name: string;
  html: string;
  css: string;
  variantLabel?: string;
}

/**
 * Extracts ALL component results from agent SDK messages.
 * Returns every valid submit_component call (multiple variants per builder).
 */
export function extractAllComponentResults(messages: SDKMessage[]): ComponentResult[] {
  const results: ComponentResult[] = [];
  const seen = new Set<string>();

  function tryAdd(parsed: Record<string, unknown>): void {
    const html = parsed.html;
    if (typeof html !== "string" || !html.trim()) return;
    const label = (parsed.variant_label as string) || undefined;
    const key = `${label || ""}:${html}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      name: (parsed.name as string) || "",
      html,
      css: (parsed.css as string) || "",
      variantLabel: label,
    });
  }

  function tryParseJson(text: string): void {
    // 1. Try JSON array of tool_use objects (subagent format)
    //    e.g. [{"type":"tool_use","name":"submit_component","input":{...}}]
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.name === "submit_component" && item.input) {
            tryAdd(item.input);
          }
        }
        return;
      }
      if (parsed && typeof parsed === "object" && parsed.html) {
        tryAdd(parsed);
        return;
      }
    } catch { /* not valid JSON, try other formats */ }

    // 2. Try XML function_calls format (subagent format)
    //    e.g. <invoke name="submit_component"><parameter name="html">...</parameter></invoke>
    if (text.includes("<invoke") && text.includes("submit_component")) {
      const invokeRegex = /<invoke\s+name="submit_component">([\s\S]*?)<\/invoke>/g;
      for (const invokeMatch of text.matchAll(invokeRegex)) {
        const body = invokeMatch[1];
        const params: Record<string, string> = {};
        const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
        for (const paramMatch of body.matchAll(paramRegex)) {
          params[paramMatch[1]] = paramMatch[2];
        }
        if (params.html) {
          tryAdd({
            name: params.name || "",
            html: params.html,
            css: params.css || "",
            variant_label: params.variant_label || undefined,
          });
        }
      }
      return;
    }

    // 3. Try extracting embedded JSON with "html" key
    const match = text.match(/\{[\s\S]*"html"[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === "object" && parsed.html) {
          tryAdd(parsed);
        }
      } catch { /* ignore */ }
    }
  }

  for (const msg of messages) {
    const msgAny = msg as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        // Direct tool_use / tool_result with structured input
        if ((block.type === "tool_result" || block.type === "tool_use") &&
            block.name === "submit_component" && block.input) {
          tryAdd(block.input);
        }

        // Tool result with nested content array (subagent MCP responses)
        if (block.type === "tool_result" && Array.isArray(block.content)) {
          for (const inner of block.content) {
            if (inner.type === "text" && typeof inner.text === "string") {
              tryParseJson(inner.text);
            }
          }
        }

        // Plain text blocks that might contain component JSON
        if (block.type === "text" && typeof block.text === "string" && block.text.includes('"html"')) {
          tryParseJson(block.text);
        }
      }
    }

    // Top-level result string
    if ("result" in msg && typeof msg.result === "string") {
      tryParseJson(msg.result);
    }
  }

  return results;
}

/**
 * Extracts a single component result (last submission).
 * Kept for backward-compat with iterator and retrier.
 */
export function extractComponentResult(messages: SDKMessage[]): ComponentResult | null {
  const all = extractAllComponentResults(messages);
  return all.length > 0 ? all[all.length - 1] : null;
}
