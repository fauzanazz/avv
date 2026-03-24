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

  test("orchestrator has section rules", () => {
    const content = loadPrompt("orchestrator");
    expect(content).toContain("Sections are rendered vertically");
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
    expect(content).toContain("Colors");
    expect(content).toContain("Spacing");
    expect(content).toContain("#2563eb");
  });

  test("builder has content rules", () => {
    const content = loadPrompt("builder");
    expect(content).toContain("NOT lorem ipsum");
    expect(content).toContain("NO external URLs");
  });

  test("conversation has mode rules", () => {
    const content = loadPrompt("conversation");
    expect(content).toContain("SIMPLE");
    expect(content).toContain("ULTRATHINK");
  });

  test("conversation has response format blocks", () => {
    const content = loadPrompt("conversation");
    expect(content).toContain("[THINKING]");
    expect(content).toContain("[OPTION");
    expect(content).toContain("[READY]");
  });

  test("all prompts include anti-patterns section", () => {
    for (const name of ["orchestrator", "builder", "conversation"] as const) {
      const content = loadPrompt(name);
      expect(content).toContain("Anti-Patterns");
    }
  });
});
