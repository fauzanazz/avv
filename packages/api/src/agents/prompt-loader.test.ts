import { describe, test, expect, beforeEach } from "bun:test";
import { join } from "path";
import { renameSync } from "fs";
import { loadPrompt, validatePrompts, clearPromptCache } from "./prompt-loader";

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
    expect(content).toContain("## Design System");
    expect(content).toContain("## Anti-Patterns");
  });

  test("loads enricher prompt", () => {
    const content = loadPrompt("enricher");
    expect(content).toContain("# AVV Prompt Enricher");
    expect(content).toContain("## Anti-Patterns");
  });

  test("loads ultrathink prompt", () => {
    const content = loadPrompt("ultrathink");
    expect(content).toContain("# AVV UltraThink Questionnaire Agent");
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

  test("orchestrator has layout rules", () => {
    const content = loadPrompt("orchestrator");
    expect(content).toContain("800px");
    expect(content).toContain("40px gap");
  });

  test("orchestrator has JSON output format", () => {
    const content = loadPrompt("orchestrator");
    expect(content).toContain("designGuidance");
    expect(content).toContain("htmlTag");
  });

  test("builder has design system", () => {
    const content = loadPrompt("builder");
    expect(content).toContain("Typography");
    expect(content).toContain("Colors");
    expect(content).toContain("Spacing");
    expect(content).toContain("#2563eb");
  });

  test("builder has content rules", () => {
    const content = loadPrompt("builder");
    expect(content).toContain("NOT lorem ipsum");
    expect(content).toContain("NO external URLs");
  });

  test("enricher has page type defaults", () => {
    const content = loadPrompt("enricher");
    expect(content).toContain("SaaS Landing");
    expect(content).toContain("Portfolio");
    expect(content).toContain("Dashboard");
  });

  test("enricher has 500 word limit rule", () => {
    const content = loadPrompt("enricher");
    expect(content).toContain("500 words");
  });

  test("ultrathink has question strategy", () => {
    const content = loadPrompt("ultrathink");
    expect(content).toContain("Purpose & Context");
    expect(content).toContain("Maximum 5 questions");
  });

  test("ultrathink has JSON output format", () => {
    const content = loadPrompt("ultrathink");
    expect(content).toContain('"id"');
    expect(content).toContain('"question"');
    expect(content).toContain('"options"');
  });

  test("all prompts include anti-patterns section", () => {
    for (const name of ["orchestrator", "builder", "enricher", "ultrathink"] as const) {
      const content = loadPrompt(name);
      expect(content).toContain("Anti-Patterns");
    }
  });
});
