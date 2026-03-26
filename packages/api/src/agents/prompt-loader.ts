import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROMPTS_DIR = join(import.meta.dir, "..", "..", "prompts");

const REQUIRED_PROMPTS = ["orchestrator", "builder", "conversation", "figma-pusher"] as const;
type PromptName = (typeof REQUIRED_PROMPTS)[number];

const promptCache = new Map<string, string>();

/**
 * Load a system prompt by name. Caches on first read.
 */
export function loadPrompt(name: PromptName): string {
  if (promptCache.has(name)) {
    return promptCache.get(name)!;
  }

  const path = join(PROMPTS_DIR, `${name}.md`);
  if (!existsSync(path)) {
    throw new Error(`Missing prompt template: ${path}`);
  }

  const content = readFileSync(path, "utf-8");
  promptCache.set(name, content);
  return content;
}

/**
 * Call at server startup to verify all required prompts exist.
 */
export function validatePrompts(): void {
  const missing: string[] = [];
  for (const name of REQUIRED_PROMPTS) {
    const path = join(PROMPTS_DIR, `${name}.md`);
    if (!existsSync(path)) {
      missing.push(`${name}.md`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing prompt templates in ${PROMPTS_DIR}:\n  ${missing.join("\n  ")}\n\nCreate these files before starting the server.`
    );
  }

  console.log(`[Prompts] All ${REQUIRED_PROMPTS.length} prompt templates validated`);
}

/**
 * Clear the cache (useful for hot-reloading prompts during development).
 */
export function clearPromptCache(): void {
  promptCache.clear();
}
