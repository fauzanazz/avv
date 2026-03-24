import { describe, it, expect, mock, beforeEach, spyOn, afterEach } from "bun:test";

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
  let broadcastSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockQuery.mockReset();
    broadcastSpy = spyOn(connectionStore, "broadcast");
  });

  afterEach(() => {
    broadcastSpy.mockRestore();
  });

  it("creates page and broadcasts section updates in simple mode", async () => {
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

    const session = sessionStore.create("todo app", "simple");

    await orchestrate({
      prompt: "todo app",
      mode: "simple",
      sessionId: session.id,
    });

    const createCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string }]) => msg.type === "page:created"
    );
    expect(createCalls.length).toBe(1);

    const updateCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string }]) => msg.type === "section:updated"
    );
    expect(updateCalls.length).toBe(1);
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
    const updates = (updateCalls[0][1] as Record<string, unknown>).updates as Record<string, string>;
    expect(updates.html).toContain("function() { return '}'; }");
  });

  it("saves plans to plan store after creating sections", async () => {
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

    const session = sessionStore.create("todo app", "simple");

    await orchestrate({
      prompt: "todo app",
      mode: "simple",
      sessionId: session.id,
    });

    // Find the pageId and sectionId from the page:created broadcast
    const createCalls = broadcastSpy.mock.calls.filter(
      ([, msg]: [string, { type: string }]) => msg.type === "page:created"
    );
    expect(createCalls.length).toBe(1);
    const page = (createCalls[0][1] as Record<string, unknown>).page as { id: string; sections: Array<{ id: string }> };
    const pageId = page.id;
    const sectionId = page.sections[0].id;

    // Verify plan was saved by pageId + sectionId
    const savedPlan = planStore.get(pageId, sectionId);
    expect(savedPlan).toBeDefined();
    expect(savedPlan!.name).toBe("Hero");
    expect(savedPlan!.designGuidance).toBe("Make it bold");
  });

  it("handles empty sections array in ultrathink mode", async () => {
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
