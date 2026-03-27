import { describe, test, expect, beforeEach } from "bun:test";
import { join } from "path";
import { renameSync } from "fs";
import { loadPrompt, loadSkill, loadBuilderSkills, validatePrompts, clearPromptCache } from "./prompt-loader";

const PROMPTS_DIR = join(import.meta.dir, "..", "..", "prompts");

beforeEach(() => {
  clearPromptCache();
});

describe("loadPrompt", () => {
  test("loads orchestrator prompt", () => {
    const content = loadPrompt("orchestrator");
    expect(content).toContain("# AVV Orchestrator Agent");
    expect(content).toContain("## Anti-Patterns");
  });

  test("loads builder prompt", () => {
    const content = loadPrompt("builder");
    expect(content).toContain("# AVV Builder Agent");
    expect(content).toContain("## Design Philosophy");
    expect(content).toContain("## Technical Constraints");
  });

  test("loads conversation prompt", () => {
    const content = loadPrompt("conversation");
    expect(content).toContain("# AVV Design Conversation Agent");
    expect(content).toContain("## Anti-Patterns");
  });

  test("caches prompt on subsequent loads", () => {
    const first = loadPrompt("orchestrator");

    // Remove the file — if cache works, second load still succeeds from cache
    const filePath = join(PROMPTS_DIR, "orchestrator.md");
    const backupPath = join(PROMPTS_DIR, "orchestrator.md.bak");
    renameSync(filePath, backupPath);
    try {
      const second = loadPrompt("orchestrator");
      expect(second).toEqual(first);
    } finally {
      renameSync(backupPath, filePath);
    }
  });

  test("throws for missing prompt file", () => {
    const missingPath = join(PROMPTS_DIR, "orchestrator.md");
    const backupPath = join(PROMPTS_DIR, "orchestrator.md.bak");

    renameSync(missingPath, backupPath);
    try {
      clearPromptCache();
      expect(() => loadPrompt("orchestrator")).toThrow("Missing prompt template");
    } finally {
      renameSync(backupPath, missingPath);
    }
  });
});

describe("validatePrompts", () => {
  test("succeeds when all prompts exist", () => {
    expect(() => validatePrompts()).not.toThrow();
  });

  test("throws when a prompt is missing", () => {
    const missingPath = join(PROMPTS_DIR, "builder.md");
    const backupPath = join(PROMPTS_DIR, "builder.md.bak");

    renameSync(missingPath, backupPath);
    try {
      expect(() => validatePrompts()).toThrow("Missing prompt templates");
      expect(() => validatePrompts()).toThrow("builder.md");
    } finally {
      renameSync(backupPath, missingPath);
    }
  });
});

describe("clearPromptCache", () => {
  test("clears cache so prompts are re-read from disk", () => {
    loadPrompt("orchestrator");
    clearPromptCache();

    // After clearing cache, the next load must read from disk again.
    // Prove this by removing the file — a cache-only read would succeed,
    // but a real disk read throws.
    const filePath = join(PROMPTS_DIR, "orchestrator.md");
    const backupPath = join(PROMPTS_DIR, "orchestrator.md.bak");
    renameSync(filePath, backupPath);
    try {
      expect(() => loadPrompt("orchestrator")).toThrow("Missing prompt template");
    } finally {
      renameSync(backupPath, filePath);
    }
  });
});

describe("loadSkill", () => {
  test("loads design-intent skill", () => {
    const content = loadSkill("design-intent");
    expect(content).toContain("Design Intent");
    expect(content).toContain("Where Defaults Hide");
  });

  test("loads animation-craft skill", () => {
    const content = loadSkill("animation-craft");
    expect(content).toContain("Animation Craft");
    expect(content).toContain("ease-out");
  });

  test("loads color-and-type skill", () => {
    const content = loadSkill("color-and-type");
    expect(content).toContain("OKLCH");
    expect(content).toContain("Tinted Neutrals");
  });

  test("loads quality-baseline skill", () => {
    const content = loadSkill("quality-baseline");
    expect(content).toContain("Quality Baseline");
    expect(content).toContain("Hard Constraints");
  });
});

describe("loadBuilderSkills", () => {
  test("concatenates all builder skills", () => {
    const combined = loadBuilderSkills();
    expect(combined).toContain("Design Intent");
    expect(combined).toContain("Animation Craft");
    expect(combined).toContain("OKLCH");
    expect(combined).toContain("Quality Baseline");
  });

  test("separates skills with dividers", () => {
    const combined = loadBuilderSkills();
    expect(combined).toContain("---");
  });
});

describe("prompt content quality", () => {
  test("orchestrator has page archetypes", () => {
    const content = loadPrompt("orchestrator");
    expect(content).toContain("Landing Page");
    expect(content).toContain("Dashboard");
    expect(content).toContain("Portfolio");
    expect(content).toContain("Documentation");
    expect(content).toContain("E-commerce");
    expect(content).toContain("Blog");
  });

  test("orchestrator has component rules", () => {
    const content = loadPrompt("orchestrator");
    expect(content).toContain("self-contained UI section");
    expect(content).toContain("full-width");
  });

  test("orchestrator has JSON output format", () => {
    const content = loadPrompt("orchestrator");
    expect(content).toContain("designGuidance");
    expect(content).toContain("htmlTag");
  });

  test("builder has design system", () => {
    const content = loadPrompt("builder");
    expect(content).toContain("Typography");
    expect(content).toContain("Color & Theme");
    expect(content).toContain("Layout & Space");
    expect(content).toContain("Surface & Depth");
  });

  test("builder has content rules", () => {
    const content = loadPrompt("builder");
    expect(content).toContain("NOT lorem ipsum");
    expect(content).toContain("NO JavaScript");
  });

  test("conversation explains the AVV flow", () => {
    const content = loadPrompt("conversation");
    expect(content).toContain("Design System Generator");
    expect(content).toContain("Layout Generator");
  });

  test("conversation has response format blocks", () => {
    const content = loadPrompt("conversation");
    expect(content).toContain("[THINKING]");
    expect(content).toContain("[READY]");
  });

  test("all prompts include anti-patterns or constraints section", () => {
    for (const name of ["orchestrator", "conversation"] as const) {
      const content = loadPrompt(name);
      expect(content).toContain("Anti-Patterns");
    }
    const builder = loadPrompt("builder");
    expect(builder).toContain("DON'T");
    expect(builder).toContain("Technical Constraints");
  });
});
