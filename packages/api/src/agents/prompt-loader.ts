import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROMPTS_DIR = join(import.meta.dir, "..", "..", "prompts");
const SKILLS_DIR = join(PROMPTS_DIR, "skills");

const REQUIRED_PROMPTS = ["orchestrator", "builder", "conversation", "figma-pusher", "figma-fetcher", "design-system-generator", "layout-generator"] as const;
type PromptName = (typeof REQUIRED_PROMPTS)[number];

const BUILDER_SKILLS = ["design-intent", "animation-craft", "color-and-type", "quality-baseline"] as const;
type SkillName = (typeof BUILDER_SKILLS)[number];

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
 * Load a skill reference by name from the skills/ directory. Caches on first read.
 */
export function loadSkill(name: SkillName): string {
  const key = `skill:${name}`;
  if (promptCache.has(key)) {
    return promptCache.get(key)!;
  }

  const path = join(SKILLS_DIR, `${name}.md`);
  if (!existsSync(path)) {
    throw new Error(`Missing skill template: ${path}`);
  }

  const content = readFileSync(path, "utf-8");
  promptCache.set(key, content);
  return content;
}

/**
 * Load all builder skills and return them concatenated.
 */
export function loadBuilderSkills(): string {
  return BUILDER_SKILLS.map((name) => loadSkill(name)).join("\n\n---\n\n");
}

/**
 * Call at server startup to verify all required prompts and skills exist.
 */
export function validatePrompts(): void {
  const missing: string[] = [];
  for (const name of REQUIRED_PROMPTS) {
    const path = join(PROMPTS_DIR, `${name}.md`);
    if (!existsSync(path)) {
      missing.push(`${name}.md`);
    }
  }

  for (const name of BUILDER_SKILLS) {
    const path = join(SKILLS_DIR, `${name}.md`);
    if (!existsSync(path)) {
      missing.push(`skills/${name}.md`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing prompt templates in ${PROMPTS_DIR}:\n  ${missing.join("\n  ")}\n\nCreate these files before starting the server.`
    );
  }

  console.log(`[Prompts] All ${REQUIRED_PROMPTS.length} prompts + ${BUILDER_SKILLS.length} skills validated`);
}

/**
 * Clear the cache (useful for hot-reloading prompts during development).
 */
export function clearPromptCache(): void {
  promptCache.clear();
}
