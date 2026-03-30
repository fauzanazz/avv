import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROMPTS_DIR = join(import.meta.dir, "..", "..", "prompts");
const SKILLS_DIR = join(PROMPTS_DIR, "skills");
const SPECIALISTS_DIR = join(PROMPTS_DIR, "specialists");

const REQUIRED_PROMPTS = ["router", "prompt-orchestrator"] as const;
type PromptName = (typeof REQUIRED_PROMPTS)[number];

const SPECIALIST_PROMPTS = [
  "design-engineer",
  "ux-engineer",
  "animation-engineer",
  "artist-engineer",
  "typewriter",
] as const;
type SpecialistName = (typeof SPECIALIST_PROMPTS)[number];

const SKILLS = ["design-intent", "animation-craft", "color-and-type", "quality-baseline"] as const;
type SkillName = (typeof SKILLS)[number];

const promptCache = new Map<string, string>();

export function loadPrompt(name: PromptName): string {
  if (promptCache.has(name)) return promptCache.get(name)!;

  const path = join(PROMPTS_DIR, `${name}.md`);
  if (!existsSync(path)) throw new Error(`Missing prompt template: ${path}`);

  const content = readFileSync(path, "utf-8");
  promptCache.set(name, content);
  return content;
}

export function loadSpecialist(name: SpecialistName): string {
  const key = `specialist:${name}`;
  if (promptCache.has(key)) return promptCache.get(key)!;

  const path = join(SPECIALISTS_DIR, `${name}.md`);
  if (!existsSync(path)) throw new Error(`Missing specialist prompt: ${path}`);

  const content = readFileSync(path, "utf-8");
  promptCache.set(key, content);
  return content;
}

export function loadSkill(name: SkillName): string {
  const key = `skill:${name}`;
  if (promptCache.has(key)) return promptCache.get(key)!;

  const path = join(SKILLS_DIR, `${name}.md`);
  if (!existsSync(path)) throw new Error(`Missing skill template: ${path}`);

  const content = readFileSync(path, "utf-8");
  promptCache.set(key, content);
  return content;
}

export function loadSkills(...names: SkillName[]): string {
  return names.map((name) => loadSkill(name)).join("\n\n---\n\n");
}

export function loadAllSkills(): string {
  return SKILLS.map((name) => loadSkill(name)).join("\n\n---\n\n");
}

export function validatePrompts(): void {
  const missing: string[] = [];

  for (const name of REQUIRED_PROMPTS) {
    const path = join(PROMPTS_DIR, `${name}.md`);
    if (!existsSync(path)) missing.push(`${name}.md`);
  }

  for (const name of SPECIALIST_PROMPTS) {
    const path = join(SPECIALISTS_DIR, `${name}.md`);
    if (!existsSync(path)) missing.push(`specialists/${name}.md`);
  }

  for (const name of SKILLS) {
    const path = join(SKILLS_DIR, `${name}.md`);
    if (!existsSync(path)) missing.push(`skills/${name}.md`);
  }

  if (missing.length > 0) {
    console.warn(
      `[Prompts] Missing templates (create before using):\n  ${missing.join("\n  ")}`
    );
    return;
  }

  console.log(
    `[Prompts] All ${REQUIRED_PROMPTS.length} prompts + ${SPECIALIST_PROMPTS.length} specialists + ${SKILLS.length} skills validated`
  );
}

export function clearPromptCache(): void {
  promptCache.clear();
}
