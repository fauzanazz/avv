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

  for (const msg of messages) {
    const msgAny = msg as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === "tool_result" || block.type === "tool_use") {
          if (block.name === "submit_component" && block.input) {
            const html = block.input.html;
            if (typeof html !== "string" || !html.trim()) continue;
            const key = `${block.input.variant_label || ""}:${html}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              name: block.input.name,
              html,
              css: block.input.css || "",
              variantLabel: block.input.variant_label || undefined,
            });
          }
        }
      }
    }

    if ("result" in msg && typeof msg.result === "string") {
      try {
        const parsed = JSON.parse(msg.result);
        if (parsed.html && typeof parsed.html === "string" && parsed.html.trim()) {
          const key = `${parsed.variant_label || ""}:${parsed.html}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              name: parsed.name,
              html: parsed.html,
              css: parsed.css || "",
              variantLabel: parsed.variant_label || undefined,
            });
          }
        }
      } catch {
        // Fallback: try extracting embedded JSON
        const match = msg.result.match(/\{[\s\S]*"html"[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.html && typeof parsed.html === "string" && parsed.html.trim()) {
              const key = `${parsed.variant_label || ""}:${parsed.html}`;
              if (!seen.has(key)) {
                seen.add(key);
                results.push({
                  name: parsed.name,
                  html: parsed.html,
                  css: parsed.css || "",
                  variantLabel: parsed.variant_label || undefined,
                });
              }
            }
          } catch {
            continue;
          }
        }
      }
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
