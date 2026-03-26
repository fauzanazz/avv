import { describe, it, expect } from "bun:test";
import { submitComponentTool } from "../src/agents/tools/submit-component";

describe("submitComponentTool", () => {
  it("has the correct name and description", () => {
    expect(submitComponentTool.name).toBe("submit_component");
    expect(submitComponentTool.description).toContain("Submit a UI component variant");
  });

  it("returns structured JSON for valid input", async () => {
    const result = await submitComponentTool.handler(
      {
        name: "Hero Section",
        html: '<div class="bg-blue-500 p-8">Hello</div>',
        css: ".custom { color: red; }",
        variant_label: "Bold",
      },
      undefined,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
    expect(parsed.name).toBe("Hero Section");
    expect(parsed.html).toBe('<div class="bg-blue-500 p-8">Hello</div>');
    expect(parsed.css).toBe(".custom { color: red; }");
    expect(parsed.variant_label).toBe("Bold");
  });

  it("returns error for whitespace-only HTML", async () => {
    const result = await submitComponentTool.handler(
      {
        name: "Empty",
        html: "   \n\t  ",
        css: "",
        variant_label: "Test",
      },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "Error: HTML content cannot be empty",
    });
  });

  it("accepts empty CSS", async () => {
    const result = await submitComponentTool.handler(
      {
        name: "Tailwind Only",
        html: '<div class="flex">Content</div>',
        css: "",
        variant_label: "Minimal",
      },
      undefined,
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
    expect(parsed.css).toBe("");
    expect(parsed.variant_label).toBe("Minimal");
  });
});
