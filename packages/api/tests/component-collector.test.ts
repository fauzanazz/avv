import { describe, it, expect } from "bun:test";
import { extractComponentResult } from "../src/agents/component-collector";

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
