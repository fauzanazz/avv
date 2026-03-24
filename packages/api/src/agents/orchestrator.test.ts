import { describe, it, expect, mock, beforeEach, spyOn } from "bun:test";

// Mock the agent SDK
const mockQuery = mock();
mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
  tool: (...args: unknown[]) => ({ name: args[0], description: args[1] }),
  createSdkMcpServer: (opts: unknown) => opts,
}));

// Import stores and orchestrate after mocking
const { connectionStore, sessionStore } = await import("../store");
const { planStore } = await import("../store/plan-store");
const { orchestrate } = await import("./orchestrator");

describe("orchestrate", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("creates components and broadcasts updates in simple mode", async () => {
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

    const broadcastSpy = spyOn(connectionStore, "broadcast");
    const session = sessionStore.create("todo app", "simple");

    await orchestrate({
      prompt: "todo app",
      mode: "simple",
      sessionId: session.id,
    });

    // Verify component was created and updated
    const createCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string }]) => msg.type === "component:created"
    );
    expect(createCalls.length).toBe(1);

    const updateCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string }]) => msg.type === "component:updated"
    );
    expect(updateCalls.length).toBe(1);

    broadcastSpy.mockRestore();
  });

  it("correctly parses JSON with braces inside string values", async () => {
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

  it("saves plans to plan store after creating components", async () => {
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

    const broadcastSpy = spyOn(connectionStore, "broadcast");
    const session = sessionStore.create("todo app", "simple");

    await orchestrate({
      prompt: "todo app",
      mode: "simple",
      sessionId: session.id,
    });

    // Find the componentId from the component:created broadcast
    const createCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string }]) => msg.type === "component:created"
    );
    expect(createCalls.length).toBe(1);
    const componentId = (createCalls[0][1] as any).component.id;

    // Verify plan was saved
    const savedPlan = planStore.get(session.id, componentId);
    expect(savedPlan).toBeDefined();
    expect(savedPlan!.name).toBe("Hero");
    expect(savedPlan!.designGuidance).toBe("Make it bold");

    broadcastSpy.mockRestore();
  });

  it("handles empty components array in ultrathink mode", async () => {
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

    // Should complete without errors
    const updatedSession = sessionStore.get(session.id);
    expect(updatedSession?.status).toBe("done");
  });
});
