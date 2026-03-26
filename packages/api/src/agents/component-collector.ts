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

  /**
   * Extract a balanced JSON object starting at position `start` in `text`
   * using brace-depth counting. Handles braces inside string literals.
   */
  function extractBalancedJson(text: string, start: number): string | null {
    if (text[start] !== "{") return null;
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") { i++; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
  }

  /** Find ALL JSON objects in `text` that contain `"html"` and try to add them. */
  function extractAllJsonObjects(text: string): void {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const braceIdx = text.indexOf("{", searchFrom);
      if (braceIdx === -1) break;

      const jsonStr = extractBalancedJson(text, braceIdx);
      if (!jsonStr) { searchFrom = braceIdx + 1; continue; }

      searchFrom = braceIdx + jsonStr.length;

      if (!jsonStr.includes('"html"')) continue;
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object") {
          // Direct component object
          if (parsed.html) { tryAdd(parsed); continue; }
          // tool_use wrapper: { name: "submit_component", input: { html: ... } }
          if (parsed.name === "submit_component" && parsed.input?.html) {
            tryAdd(parsed.input);
          }
        }
      } catch { /* malformed JSON, skip */ }
    }
  }

  function tryParseText(text: string): void {
    const trimmed = text.trim();

    // 1. Try as JSON (single object or array)
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.name === "submit_component" && item.input) tryAdd(item.input);
          else if (item.html) tryAdd(item);
        }
        return;
      }
      if (parsed && typeof parsed === "object" && parsed.html) { tryAdd(parsed); return; }
    } catch { /* not clean JSON */ }

    // 2. XML function_calls format
    if (text.includes("<invoke") && text.includes("submit_component")) {
      const invokeRegex = /<invoke\s+name="submit_component">([\s\S]*?)<\/invoke>/g;
      for (const invokeMatch of text.matchAll(invokeRegex)) {
        const body = invokeMatch[1];
        const params: Record<string, string> = {};
        for (const pm of body.matchAll(/<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g)) {
          params[pm[1]] = pm[2];
        }
        if (params.html) {
          tryAdd({ name: params.name || "", html: params.html, css: params.css || "", variant_label: params.variant_label });
        }
      }
      if (results.length > 0) return;
    }

    // 3. Scan for ALL embedded JSON objects containing "html" (catches every format:
    //    submit_component({...}), [Tool: submit_component]\n{...}, mixed prose + JSON, etc.)
    if (text.includes('"html"')) {
      extractAllJsonObjects(text);
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
              tryParseText(inner.text);
            }
          }
        }

        // Plain text blocks that might contain component JSON
        if (block.type === "text" && typeof block.text === "string" && block.text.includes('"html"')) {
          tryParseText(block.text);
        }
      }
    }

    // Top-level result string
    if ("result" in msg && typeof msg.result === "string") {
      tryParseText(msg.result);
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
