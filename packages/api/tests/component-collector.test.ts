import { describe, it, expect } from "bun:test";
import { extractComponentResult, extractAllComponentResults } from "../src/agents/component-collector";

describe("extractComponentResult", () => {
  it("returns null for empty messages", () => {
    expect(extractComponentResult([])).toBeNull();
  });

  it("extracts from tool_use blocks", () => {
    const messages = [
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: {
                name: "Hero",
                html: "<div>Hero</div>",
                css: ".hero { color: blue; }",
                variant_label: "Bold",
              },
            },
          ],
        },
      },
    ] as any[];

    const result = extractComponentResult(messages);
    expect(result).toEqual({
      name: "Hero",
      html: "<div>Hero</div>",
      css: ".hero { color: blue; }",
      variantLabel: "Bold",
    });
  });

  it("defaults css to empty string when missing from tool_use", () => {
    const messages = [
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: {
                name: "Nav",
                html: "<nav>Nav</nav>",
              },
            },
          ],
        },
      },
    ] as any[];

    const result = extractComponentResult(messages);
    expect(result).toEqual({
      name: "Nav",
      html: "<nav>Nav</nav>",
      css: "",
      variantLabel: undefined,
    });
  });

  it("extracts from result text (JSON fallback)", () => {
    const messages = [
      {
        result: JSON.stringify({
          name: "Footer",
          html: "<footer>Footer</footer>",
          css: "",
        }),
      },
    ] as any[];

    const result = extractComponentResult(messages);
    expect(result).toEqual({
      name: "Footer",
      html: "<footer>Footer</footer>",
      css: "",
      variantLabel: undefined,
    });
  });

  it("extracts from result text with embedded JSON (regex fallback)", () => {
    const messages = [
      {
        result: 'Here is the component: {"name":"Card","html":"<div>Card</div>","css":""} done.',
      },
    ] as any[];

    const result = extractComponentResult(messages);
    expect(result).toEqual({
      name: "Card",
      html: "<div>Card</div>",
      css: "",
      variantLabel: undefined,
    });
  });

  it("returns null when no valid component found", () => {
    const messages = [
      { result: "Just some text with no JSON" },
      { message: { content: [{ type: "text", text: "hello" }] } },
    ] as any[];

    expect(extractComponentResult(messages)).toBeNull();
  });

  it("skips non-submit_component tool_use blocks", () => {
    const messages = [
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "other_tool",
              input: { name: "X", html: "<div>X</div>", css: "" },
            },
          ],
        },
      },
    ] as any[];

    expect(extractComponentResult(messages)).toBeNull();
  });
});

describe("extractAllComponentResults", () => {
  it("returns empty array for empty messages", () => {
    expect(extractAllComponentResults([])).toEqual([]);
  });

  it("extracts multiple variants from tool_use blocks", () => {
    const messages = [
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: {
                name: "Hero",
                html: "<div>Hero Minimal</div>",
                css: "",
                variant_label: "Minimal",
              },
            },
          ],
        },
      },
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: {
                name: "Hero",
                html: "<div>Hero Bold</div>",
                css: ".bold { font-weight: 700; }",
                variant_label: "Bold",
              },
            },
          ],
        },
      },
    ] as any[];

    const results = extractAllComponentResults(messages);
    expect(results).toHaveLength(2);
    expect(results[0].variantLabel).toBe("Minimal");
    expect(results[1].variantLabel).toBe("Bold");
    expect(results[0].html).toBe("<div>Hero Minimal</div>");
    expect(results[1].html).toBe("<div>Hero Bold</div>");
  });

  it("deduplicates identical submissions", () => {
    const messages = [
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: { name: "Hero", html: "<div>Same</div>", css: "", variant_label: "v1" },
            },
          ],
        },
      },
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: { name: "Hero", html: "<div>Same</div>", css: "", variant_label: "v1" },
            },
          ],
        },
      },
    ] as any[];

    const results = extractAllComponentResults(messages);
    expect(results).toHaveLength(1);
  });

  it("returns last result via extractComponentResult when multiple exist", () => {
    const messages = [
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: { name: "Hero", html: "<div>First</div>", css: "", variant_label: "Minimal" },
            },
          ],
        },
      },
      {
        message: {
          content: [
            {
              type: "tool_use",
              name: "submit_component",
              input: { name: "Hero", html: "<div>Last</div>", css: "", variant_label: "Bold" },
            },
          ],
        },
      },
    ] as any[];

    const result = extractComponentResult(messages);
    expect(result!.html).toBe("<div>Last</div>");
    expect(result!.variantLabel).toBe("Bold");
  });

  it("extracts from tool_result with nested content array (subagent MCP)", () => {
    const componentJson = JSON.stringify({
      name: "Hero",
      html: "<div>Hero MCP</div>",
      css: ".hero { color: red; }",
      variant_label: "Minimal",
    });

    const messages = [
      {
        message: {
          content: [
            {
              type: "tool_result",
              content: [
                { type: "text", text: componentJson },
              ],
            },
          ],
        },
      },
    ] as any[];

    const results = extractAllComponentResults(messages);
    expect(results).toHaveLength(1);
    expect(results[0].html).toBe("<div>Hero MCP</div>");
    expect(results[0].variantLabel).toBe("Minimal");
  });

  it("extracts from text blocks containing component JSON", () => {
    const messages = [
      {
        message: {
          content: [
            {
              type: "text",
              text: JSON.stringify({ name: "Nav", html: "<nav>Nav</nav>", css: "", variant_label: "Dark" }),
            },
          ],
        },
      },
    ] as any[];

    const results = extractAllComponentResults(messages);
    expect(results).toHaveLength(1);
    expect(results[0].html).toBe("<nav>Nav</nav>");
    expect(results[0].variantLabel).toBe("Dark");
  });
});
