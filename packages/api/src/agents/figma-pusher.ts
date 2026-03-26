import { query, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ViewerComponent } from "@avv/shared";
import { connectionStore } from "../store";
import { loadPrompt } from "./prompt-loader";

const FIGMA_MCP_URL = process.env.FIGMA_MCP_URL || "https://mcp.figma.com/mcp";
const FIGMA_MCP_TOKEN = process.env.FIGMA_MCP_TOKEN || "";

export interface FigmaPushOptions {
  wsSessionId: string;
  title: string;
  components: ViewerComponent[];
}

function buildComponentSummary(components: ViewerComponent[]): string {
  return components
    .sort((a, b) => a.order - b.order)
    .map((comp) => {
      const activeVariant = comp.variants[comp.variants.length - 1];
      if (!activeVariant) return "";
      return `### ${comp.name} (variant: ${activeVariant.label})

\`\`\`html
${activeVariant.html}
\`\`\`

\`\`\`css
${activeVariant.css}
\`\`\``;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function createFigmaMcpConfig(): McpServerConfig {
  const config: McpServerConfig = {
    type: "http" as const,
    url: FIGMA_MCP_URL,
  };

  if (FIGMA_MCP_TOKEN) {
    (config as any).headers = {
      Authorization: `Bearer ${FIGMA_MCP_TOKEN}`,
    };
  }

  return config;
}

export async function pushToFigma({
  wsSessionId,
  title,
  components,
}: FigmaPushOptions): Promise<void> {
  if (!FIGMA_MCP_TOKEN) {
    connectionStore.broadcast(wsSessionId, {
      type: "figma:error",
      message: "Figma MCP token not configured. Set FIGMA_MCP_TOKEN environment variable.",
    });
    return;
  }

  const readyComponents = components.filter(
    (c) => c.status === "ready" && c.variants.length > 0
  );

  if (readyComponents.length === 0) {
    connectionStore.broadcast(wsSessionId, {
      type: "figma:error",
      message: "No ready components to push to Figma.",
    });
    return;
  }

  const systemPrompt = loadPrompt("figma-pusher");
  const componentSummary = buildComponentSummary(readyComponents);

  connectionStore.broadcast(wsSessionId, {
    type: "figma:pushing",
    message: `Pushing ${readyComponents.length} components to Figma...`,
  });

  connectionStore.broadcast(wsSessionId, {
    type: "agent:log",
    agentId: "figma-pusher",
    message: `Creating "${title}" in Figma with ${readyComponents.length} components`,
  });

  try {
    let resultText = "";

    for await (const message of query({
      prompt: `## Design: "${title}"

Create this design in Figma. Use the Figma MCP tools to create frames and components for each section.

## Components

${componentSummary}

## Instructions

1. Create a new page or frame for this design
2. For each component, create a Figma frame that visually matches the HTML/CSS
3. Set proper colors, typography, spacing, and layout
4. Name everything clearly
5. Report what you created when done`,
      options: {
        systemPrompt,
        mcpServers: {
          figma: createFigmaMcpConfig(),
        },
        maxTurns: 20,
      },
    })) {
      if ("result" in message && message.result) {
        resultText = message.result;
      }
    }

    const figmaUrlMatch = resultText.match(
      /https:\/\/(?:www\.)?figma\.com\/(?:file|design)\/[a-zA-Z0-9]+[^\s)>\]"]*/
    );

    if (figmaUrlMatch) {
      connectionStore.broadcast(wsSessionId, {
        type: "figma:pushed",
        figmaUrl: figmaUrlMatch[0],
      });
    } else {
      connectionStore.broadcast(wsSessionId, {
        type: "figma:pushed",
        figmaUrl: "",
      });
    }

    connectionStore.broadcast(wsSessionId, {
      type: "agent:log",
      agentId: "figma-pusher",
      message: resultText
        ? `Figma implementation complete. ${figmaUrlMatch ? figmaUrlMatch[0] : "Check your Figma file."}`
        : "Figma implementation complete.",
    });
  } catch (err) {
    console.error("[FigmaPusher] Failed:", err);
    connectionStore.broadcast(wsSessionId, {
      type: "figma:error",
      message: `Failed to push to Figma: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
}
