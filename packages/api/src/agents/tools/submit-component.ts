import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * MCP tool that builder subagents call to submit their generated component.
 * Builders call this multiple times to submit different design variants.
 */
export const submitComponentTool = tool(
  "submit_component",
  "Submit a UI component variant. Call this tool once per design variant — you should submit 2-3 different design approaches for the same component.",
  {
    name: z.string().describe("The component name (e.g., 'Hero Section')"),
    html: z.string().min(1).describe("The HTML content of the component. Must be a valid HTML fragment."),
    css: z.string().describe("CSS styles for the component. Can be empty if using Tailwind classes."),
    variant_label: z.string().describe("Short label for this variant (e.g., 'Minimal', 'Bold', 'Gradient'). Describes the design approach."),
  },
  async (args) => {
    if (!args.html.trim()) {
      return {
        content: [{ type: "text" as const, text: "Error: HTML content cannot be empty" }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            name: args.name,
            html: args.html,
            css: args.css,
            variant_label: args.variant_label,
          }),
        },
      ],
    };
  }
);
