import { describe, it, expect, mock, beforeEach, spyOn } from "bun:test";

// Mock the agent SDK
const mockQuery = mock();
mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
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
      components: [
        {
          name: "Hero",
          description: "Hero section",
          htmlTag: "section",
          order: 0,
          width: 800,
          height: 400,
          x: 100,
          y: 100,
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

  it("does NOT call enrichPrompt in ultrathink mode", async () => {
    const planJson = JSON.stringify({
      title: "Test Page",
      summary: "A test page",
      components: [],
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
