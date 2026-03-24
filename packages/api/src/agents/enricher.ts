import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadPrompt } from "./prompt-loader";

/**
 * Enriches a user prompt with UI/UX best practices.
 * Returns an enriched prompt that gives the orchestrator more to work with.
 */
export async function enrichPrompt(userPrompt: string): Promise<string> {
  const enricherPrompt = loadPrompt("enricher");

  let enrichedResult = "";

  for await (const message of query({
    prompt: `${enricherPrompt}

## User's original prompt:

"${userPrompt}"

Enrich this prompt. Output ONLY the enriched prompt text — no JSON, no markdown, no explanation.`,
    options: {
      allowedTools: [],
      maxTurns: 1,
      model: "haiku",
    },
  })) {
    if ("result" in message) {
      enrichedResult = message.result;
    }
  }

  return enrichedResult.trim() || userPrompt;
}
