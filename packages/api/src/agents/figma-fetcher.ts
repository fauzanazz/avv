import { query, createSdkMcpServer, type McpServerConfig, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { Screen, ViewerComponent, ComponentVariant } from "@avv/shared";
import { connectionStore } from "../store";
import { projectStore } from "../store/project-store";
import { loadPrompt } from "./prompt-loader";
import { submitComponentTool } from "./tools/submit-component";
import { extractAllComponentResults } from "./component-collector";

const FIGMA_MCP_URL = process.env.FIGMA_MCP_URL || "https://mcp.figma.com/mcp";
const FIGMA_MCP_TOKEN = process.env.FIGMA_MCP_TOKEN || "";

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

export interface FigmaFetchOptions {
  wsSessionId: string;
  figmaUrl: string;
  nodeId?: string;
}

export interface FigmaImportOptions {
  wsSessionId: string;
  figmaUrl: string;
  nodeId?: string;
}

/**
 * Fetch a Figma design as reference context (no conversion to HTML)
 */
export async function fetchFigmaAsReference({
  wsSessionId,
  figmaUrl,
  nodeId,
}: FigmaFetchOptions): Promise<void> {
  if (!FIGMA_MCP_TOKEN) {
    connectionStore.broadcast(wsSessionId, {
      type: "figma:error",
      message: "Figma MCP token not configured. Set FIGMA_MCP_TOKEN environment variable.",
    });
    return;
  }

  const systemPrompt = loadPrompt("figma-fetcher");

  connectionStore.broadcast(wsSessionId, {
    type: "agent:log",
    agentId: "figma-fetcher",
    message: `Fetching Figma design as reference: ${figmaUrl}${nodeId ? ` (node: ${nodeId})` : ""}`,
  });

  try {
    let resultText = "";

    for await (const message of query({
      prompt: `## Figma Reference Fetch

Fetch the design from this Figma URL and extract design information as reference context.

**URL**: ${figmaUrl}
${nodeId ? `**Node ID**: ${nodeId}` : "**Mode**: Fetch the main page/frame"}

Use Figma MCP tools to read the file, then output a [FIGMA_REFERENCE] block with:
- Design overview (name, dimensions)
- Color palette (extract exact hex values)
- Typography (font families, sizes)
- Layout structure
- List of components/sections

This information will be used as context for design decisions.`,
      options: {
        systemPrompt,
        mcpServers: {
          figma: createFigmaMcpConfig(),
        },
        maxTurns: 10,
      },
    })) {
      if ("result" in message && message.result) {
        resultText = message.result;
      }
    }

    // Extract the reference block and send as agent log
    const refMatch = resultText.match(/\[FIGMA_REFERENCE\]([\s\S]*?)\[\/FIGMA_REFERENCE\]/);
    const referenceContent = refMatch ? refMatch[1].trim() : resultText;

    connectionStore.broadcast(wsSessionId, {
      type: "agent:log",
      agentId: "figma-fetcher",
      message: `Figma reference loaded:\n\n${referenceContent}`,
    });
  } catch (err) {
    console.error("[FigmaFetcher] Fetch failed:", err);
    connectionStore.broadcast(wsSessionId, {
      type: "figma:error",
      message: `Failed to fetch Figma: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
}

/**
 * Import a Figma design as an editable screen (converts to HTML/CSS components)
 */
export async function importFigmaAsScreen({
  wsSessionId,
  figmaUrl,
  nodeId,
}: FigmaImportOptions): Promise<void> {
  if (!FIGMA_MCP_TOKEN) {
    connectionStore.broadcast(wsSessionId, {
      type: "figma:error",
      message: "Figma MCP token not configured. Set FIGMA_MCP_TOKEN environment variable.",
    });
    return;
  }

  const project = projectStore.getBySession(wsSessionId);
  if (!project) {
    connectionStore.broadcast(wsSessionId, {
      type: "error",
      message: "No active project. Start a design first.",
    });
    return;
  }

  const systemPrompt = loadPrompt("figma-fetcher");
  const builderPrompt = loadPrompt("builder");

  connectionStore.broadcast(wsSessionId, {
    type: "agent:log",
    agentId: "figma-importer",
    message: `Importing Figma design as editable screen: ${figmaUrl}`,
  });

  // Create a screen placeholder
  const screen: Screen = {
    id: crypto.randomUUID(),
    name: "Imported from Figma",
    status: "generating",
    components: [],
    layoutOptions: [],
    selectedLayoutId: null,
    prompt: `Imported from Figma: ${figmaUrl}`,
  };
  projectStore.addScreen(wsSessionId, screen);
  connectionStore.broadcast(wsSessionId, { type: "screen:created", screen });

  const designSystemContext = project.designSystem
    ? `\n## Active Design System\n\nUse these CSS custom properties where appropriate:\n\n\`\`\`css\n${project.designSystem.css}\n\`\`\`\n`
    : "";

  const importerAgent: AgentDefinition = {
    description: "Imports Figma designs and converts them to HTML/CSS components",
    prompt: `${builderPrompt}

${designSystemContext}

## Your Task

You are importing a Figma design into AVV. Use Figma MCP tools to read the design, then convert each major section/frame into an HTML/CSS component.

For each section you identify:
1. Extract the visual properties (colors, fonts, spacing, layout)
2. Generate HTML/CSS that accurately recreates the design
3. Call submit_component with the result

Use exact colors and fonts from Figma. If the project has a design system, use CSS custom properties where the Figma values match.`,
    tools: ["submit_component"],
    model: "sonnet",
  };

  const mcpServer = createSdkMcpServer({
    name: "avv-tools",
    tools: [submitComponentTool],
  });

  try {
    const collectedMessages: any[] = [];

    for await (const message of query({
      prompt: `## Figma Import

Import this Figma design as editable HTML/CSS components.

**URL**: ${figmaUrl}
${nodeId ? `**Node ID**: ${nodeId}` : "**Mode**: Import the main page/frame"}

1. First, use Figma MCP tools to read the design
2. Identify the major sections (nav, hero, features, etc.)
3. For each section, call submit_component with HTML/CSS that recreates it
4. Use exact colors, fonts, and spacing from the Figma file

Use the figma-importer agent to do the conversion.`,
      options: {
        systemPrompt,
        mcpServers: {
          figma: createFigmaMcpConfig(),
          "avv-tools": mcpServer,
        },
        agents: { "figma-importer": importerAgent },
        allowedTools: ["Agent", "mcp__avv-tools__submit_component"],
        maxTurns: 20,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
    })) {
      collectedMessages.push(message);
    }

    const results = extractAllComponentResults(collectedMessages);

    if (results.length > 0) {
      const now = new Date().toISOString();
      const components: ViewerComponent[] = results.map((r, idx) => ({
        id: crypto.randomUUID(),
        name: r.variantLabel || `Section ${idx + 1}`,
        status: "ready" as const,
        variants: [{
          id: crypto.randomUUID(),
          html: r.html,
          css: r.css,
          label: "imported",
          createdAt: now,
        }],
        prompt: "Imported from Figma",
        agentId: "figma-importer",
        iteration: 0,
        order: idx,
      }));

      projectStore.updateScreen(wsSessionId, screen.id, {
        name: `Figma Import`,
        components,
        status: "ready",
      });

      connectionStore.broadcast(wsSessionId, {
        type: "screen:updated",
        screenId: screen.id,
        updates: { name: "Figma Import", components, status: "ready" },
      });

      connectionStore.broadcast(wsSessionId, {
        type: "agent:log",
        agentId: "figma-importer",
        message: `Imported ${components.length} components from Figma.`,
      });
    } else {
      projectStore.updateScreen(wsSessionId, screen.id, { status: "error" });
      connectionStore.broadcast(wsSessionId, {
        type: "screen:updated",
        screenId: screen.id,
        updates: { status: "error" },
      });
      connectionStore.broadcast(wsSessionId, {
        type: "figma:error",
        message: "Failed to extract components from Figma design.",
      });
    }
  } catch (err) {
    console.error("[FigmaImporter] Import failed:", err);
    projectStore.updateScreen(wsSessionId, screen.id, { status: "error" });
    connectionStore.broadcast(wsSessionId, {
      type: "screen:updated",
      screenId: screen.id,
      updates: { status: "error" },
    });
    connectionStore.broadcast(wsSessionId, {
      type: "figma:error",
      message: `Failed to import from Figma: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
}
