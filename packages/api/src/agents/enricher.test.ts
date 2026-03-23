import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock the agent SDK before importing enricher
const mockQuery = mock();
mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
  tool: (...args: unknown[]) => ({ name: args[0], description: args[1] }),
  createSdkMcpServer: (opts: unknown) => opts,
}));

// Import after mocking
const { enrichPrompt } = await import("./enricher");

describe("enrichPrompt", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns enriched prompt from LLM response", async () => {
    const enrichedText =
      "A modern, clean landing page for a todo app with blue-slate palette...";

    async function* fakeQuery() {
      yield { result: enrichedText };
    }
    mockQuery.mockReturnValue(fakeQuery());

    const result = await enrichPrompt("todo app");
    expect(result).toBe(enrichedText);
  });

  it("falls back to original prompt when LLM returns empty", async () => {
    async function* fakeQuery() {
      yield { result: "" };
    }
    mockQuery.mockReturnValue(fakeQuery());

    const result = await enrichPrompt("todo app");
    expect(result).toBe("todo app");
  });

  it("falls back to original prompt when no result message is yielded", async () => {
    async function* fakeQuery() {
      yield { type: "thinking", content: "..." };
    }
    mockQuery.mockReturnValue(fakeQuery());

    const result = await enrichPrompt("my portfolio site");
    expect(result).toBe("my portfolio site");
  });

  it("passes correct options to query", async () => {
    async function* fakeQuery() {
      yield { result: "enriched" };
    }
    mockQuery.mockReturnValue(fakeQuery());

    await enrichPrompt("dashboard");

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain("dashboard");
    expect(callArgs.prompt).toContain("User's original prompt");
    expect(callArgs.options.allowedTools).toEqual([]);
    expect(callArgs.options.maxTurns).toBe(1);
    expect(callArgs.options.model).toBe("haiku");
  });
});
