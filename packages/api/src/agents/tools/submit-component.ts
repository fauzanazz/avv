import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * MCP tool that builder subagents call to submit their generated component.
 * Using a tool ensures structured output instead of brittle text parsing.
 */
export const submitComponentTool = tool(
  "submit_component",
  "Submit the generated UI component. Call this tool with the component name, HTML content, and CSS styles.",
  {
    name: z.string().describe("The component name (e.g., 'Hero Section')"),
    html: z.string().min(1).describe("The HTML content of the component. Must be a valid HTML fragment."),
    css: z.string().describe("CSS styles for the component. Can be empty if using Tailwind classes."),
  },
  async (args) => {
    // Validation
    if (!args.html.trim()) {
      return {
        content: [{ type: "text" as const, text: "Error: HTML content cannot be empty" }],
        isError: true,
      };
    }

    // Store the result — it will be read by the orchestrator after the query completes
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            name: args.name,
            html: args.html,
            css: args.css,
          }),
        },
      ],
    };
  }
);
