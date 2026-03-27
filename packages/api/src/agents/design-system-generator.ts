import { query } from "@anthropic-ai/claude-agent-sdk";
import type { DesignSystem, DesignTokens } from "@avv/shared";
import { compileTokensToCSS } from "@avv/shared";
import { connectionStore } from "../store";
import { projectStore } from "../store/project-store";
import { loadPrompt } from "./prompt-loader";

interface DesignSystemOption {
  label: string;
  tokens: DesignTokens;
}

interface DesignSystemResponse {
  options: DesignSystemOption[];
}

function extractJsonObject(text: string, requiredKey: string): string | null {
  const keyIndex = text.indexOf(`"${requiredKey}"`);
  if (keyIndex === -1) return null;

  let start = -1;
  for (let i = keyIndex - 1; i >= 0; i--) {
    if (text[i] === "{") {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseDesignSystemResponse(text: string): DesignSystemResponse | null {
  const json = extractJsonObject(text, "options");
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length === 0) return null;
    return parsed as DesignSystemResponse;
  } catch {
    return null;
  }
}

export interface GenerateDesignSystemOptions {
  prompt: string;
  sessionId: string;
}

export async function generateDesignSystems({ prompt, sessionId }: GenerateDesignSystemOptions): Promise<DesignSystem[]> {
  const systemPrompt = loadPrompt("design-system-generator");

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "design-system",
    message: "Generating design system options...",
  });

  let responseText = "";

  for await (const message of query({
    prompt: `## User Request\n\n"${prompt}"\n\nGenerate 3 distinct design system token sets for this project. Respond with ONLY the JSON object.`,
    options: {
      systemPrompt,
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    if ("result" in message) {
      responseText = message.result;
    }
  }

  const parsed = parseDesignSystemResponse(responseText);
  if (!parsed) {
    connectionStore.broadcast(sessionId, {
      type: "error",
      message: "Failed to generate design system options",
    });
    return [];
  }

  const designSystems: DesignSystem[] = parsed.options.map((opt) => ({
    id: crypto.randomUUID(),
    label: opt.label,
    tokens: opt.tokens,
    css: compileTokensToCSS(opt.tokens),
  }));

  projectStore.setDesignSystemOptions(sessionId, designSystems);

  connectionStore.broadcast(sessionId, {
    type: "designsystem:options",
    options: designSystems,
  });

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "design-system",
    message: `Generated ${designSystems.length} design system options. Please select one to continue.`,
  });

  return designSystems;
}
