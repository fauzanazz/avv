import { describe, it, expect, mock, beforeEach, spyOn } from "bun:test";

// Mock the agent SDK
const mockQuery = mock();
mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
  tool: (...args: unknown[]) => ({ name: args[0], description: args[1] }),
  createSdkMcpServer: (opts: unknown) => opts,
}));

// Mock enrichPrompt
const mockEnrichPrompt = mock();
mock.module("./enricher", () => ({
  enrichPrompt: mockEnrichPrompt,
}));

// Import stores and orchestrate after mocking
const { connectionStore, sessionStore } = await import("../store");
const { orchestrate } = await import("./orchestrator");

describe("orchestrate", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnrichPrompt.mockReset();

    // Create a session so orchestrate can update it
    sessionStore.create("test prompt", "simple");
    // Manually set the id to our test session id
    const sessions = sessionStore.list();
    if (sessions.length > 0) {
      // We need to work with whatever session was created
    }
  });

  it("calls enrichPrompt in simple mode", async () => {
    mockEnrichPrompt.mockResolvedValue("enriched prompt text");

    // Mock query to return a valid plan on first call, then component on second
    const planJson = JSON.stringify({
      title: "Test Page",
      summary: "A test page",
      sections: [
        {
          name: "Hero",
          description: "Hero section",
          htmlTag: "section",
          order: 0,
          designGuidance: "Make it bold",
        },
      ],
    });

    const componentJson = JSON.stringify({
      name: "Hero",
      html: "<section>Hero</section>",
      css: ".hero { color: blue; }",
    });

    let callCount = 0;
    mockQuery.mockImplementation(() => {
      callCount++;
      async function* gen() {
        if (callCount === 1) {
          yield { result: planJson };
        } else {
          yield { result: componentJson };
        }
      }
      return gen();
    });

    // Spy on broadcast to verify enricher messages
    const broadcastSpy = spyOn(connectionStore, "broadcast");

    const session = sessionStore.create("todo app", "simple");

    await orchestrate({
      prompt: "todo app",
      mode: "simple",
      sessionId: session.id,
    });

    expect(mockEnrichPrompt).toHaveBeenCalledWith("todo app");

    // Verify enricher log messages were broadcast
    const enricherCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string; agentId?: string }]) =>
        msg.type === "agent:log" && msg.agentId === "enricher"
    );
    expect(enricherCalls.length).toBe(2);

    broadcastSpy.mockRestore();
  });

  it("correctly parses JSON with braces inside string values", async () => {
    mockEnrichPrompt.mockResolvedValue("enriched");

    const planJson = JSON.stringify({
      title: "Test",
      summary: "Test",
      sections: [
        {
          name: "Code",
          description: "Code section",
          htmlTag: "section",
          order: 0,
          designGuidance: "Show code",
        },
      ],
    });

    // Component JSON with unbalanced braces inside string values
    const componentJson = JSON.stringify({
      name: "Code",
      html: "<pre>function() { return '}'; }</pre>",
      css: ".code { font-family: monospace; }",
    });

    let callCount = 0;
    mockQuery.mockImplementation(() => {
      callCount++;
      async function* gen() {
        if (callCount === 1) {
          yield { result: planJson };
        } else {
          yield { result: componentJson };
        }
      }
      return gen();
    });

    const broadcastSpy = spyOn(connectionStore, "broadcast");
    const session = sessionStore.create("code block", "simple");

    await orchestrate({
      prompt: "code block",
      mode: "simple",
      sessionId: session.id,
    });

    // Verify the section was updated with the full HTML (not truncated at first })
    const updateCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string }]) => msg.type === "section:updated"
    );
    expect(updateCalls.length).toBe(1);
    const updates = (updateCalls[0][1] as any).updates;
    expect(updates.html).toContain("function() { return '}'; }");

    broadcastSpy.mockRestore();
  });

  it("does NOT call enrichPrompt in ultrathink mode", async () => {
    const planJson = JSON.stringify({
      title: "Test Page",
      summary: "A test page",
      sections: [],
    });

    mockQuery.mockImplementation(() => {
      async function* gen() {
        yield { result: planJson };
      }
      return gen();
    });

    const session = sessionStore.create("todo app", "ultrathink");

    await orchestrate({
      prompt: "todo app",
      mode: "ultrathink",
      sessionId: session.id,
    });

    expect(mockEnrichPrompt).not.toHaveBeenCalled();
  });
});
