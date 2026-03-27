import { query, createSdkMcpServer, type SDKMessage, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DesignSystem, LayoutOption, ViewerComponent, ComponentVariant, Screen } from "@avv/shared";
import { connectionStore } from "../store";
import { projectStore } from "../store/project-store";
import { loadPrompt, loadBuilderSkills } from "./prompt-loader";
import { submitComponentTool } from "./tools/submit-component";
import { createRequestImageTool } from "./tools";
import { extractAllComponentResults } from "./component-collector";

interface LayoutComponentPlan {
  name: string;
  description: string;
  htmlTag: string;
  order: number;
  designGuidance: string;
}

interface LayoutPlan {
  label: string;
  components: LayoutComponentPlan[];
}

interface LayoutResponse {
  screenName: string;
  layouts: LayoutPlan[];
}

function extractJsonObject(text: string, requiredKey: string): string | null {
  const keyIndex = text.indexOf(`"${requiredKey}"`);
  if (keyIndex === -1) return null;

  let start = -1;
  for (let i = keyIndex - 1; i >= 0; i--) {
    if (text[i] === "{") { start = i; break; }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseLayoutResponse(text: string): LayoutResponse | null {
  const json = extractJsonObject(text, "layouts");
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed.layouts || !Array.isArray(parsed.layouts)) return null;
    return parsed as LayoutResponse;
  } catch {
    return null;
  }
}

function createBuilderAgent(
  component: LayoutComponentPlan,
  designSystem: DesignSystem,
): AgentDefinition {
  const builderPrompt = loadPrompt("builder");
  const skills = loadBuilderSkills();

  return {
    description: `Builds the "${component.name}" UI component using the project's design system.`,
    prompt: `${builderPrompt}

---

## Skill References

${skills}

---

## Design System (CSS Custom Properties)

Use these CSS custom properties in your HTML. Do NOT hardcode colors, fonts, or spacing.

\`\`\`css
${designSystem.css}
\`\`\`

## Your Task

Build the "${component.name}" component.

**Description:** ${component.description}
**Design guidance:** ${component.designGuidance}

## Instructions

1. Generate the HTML using CSS custom properties (var(--color-primary), var(--font-heading), etc.)
2. Call submit_component ONCE with the final result
3. The component must be a complete, standalone HTML fragment
4. Use real-sounding content, not placeholders
5. Use full-width layout (width: 100%) — the viewer container handles sizing
6. Reference the design system variables — do NOT hardcode colors or font families`,
    tools: ["submit_component"],
    model: "sonnet",
  };
}

export interface GenerateLayoutsOptions {
  prompt: string;
  sessionId: string;
  designSystem: DesignSystem;
  screenName?: string;
}

export async function generateLayouts({ prompt, sessionId, designSystem, screenName }: GenerateLayoutsOptions): Promise<void> {
  const systemPrompt = loadPrompt("layout-generator");

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "layout",
    message: "Generating 3 layout alternatives...",
  });

  let responseText = "";

  for await (const message of query({
    prompt: `## User Request\n\n"${prompt}"\n\n## Active Design System: "${designSystem.label}"\n\n\`\`\`css\n${designSystem.css}\n\`\`\`\n\nGenerate 3 distinct full-page layout alternatives that use these design system tokens. Respond with ONLY the JSON object.`,
    options: {
      systemPrompt,
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    if ("result" in message) {
      responseText = message.result;
    }
  }

  const parsed = parseLayoutResponse(responseText);
  if (!parsed) {
    connectionStore.broadcast(sessionId, { type: "error", message: "Failed to generate layout options" });
    return;
  }

  const resolvedScreenName = screenName || parsed.screenName || "Home";

  // Create the screen
  const screen: Screen = {
    id: crypto.randomUUID(),
    name: resolvedScreenName,
    status: "generating",
    components: [],
    layoutOptions: [],
    selectedLayoutId: null,
    prompt,
  };
  projectStore.addScreen(sessionId, screen);

  connectionStore.broadcast(sessionId, { type: "screen:created", screen });

  // Build each layout's components in parallel
  const layoutOptions: LayoutOption[] = [];

  for (const layoutPlan of parsed.layouts) {
    const layoutId = crypto.randomUUID();
    const components = await buildLayoutComponents(layoutPlan, designSystem, sessionId, screen.id);

    const previewHtml = components
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const variant = c.variants[0];
        return variant ? variant.html : "";
      })
      .join("\n");

    layoutOptions.push({
      id: layoutId,
      label: layoutPlan.label,
      components,
      previewHtml,
    });
  }

  projectStore.setLayoutOptions(sessionId, screen.id, layoutOptions);

  connectionStore.broadcast(sessionId, {
    type: "layout:options",
    screenId: screen.id,
    options: layoutOptions,
  });

  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "layout",
    message: `Generated ${layoutOptions.length} layout alternatives for "${resolvedScreenName}". Please select one.`,
  });
}

async function buildLayoutComponents(
  layoutPlan: LayoutPlan,
  designSystem: DesignSystem,
  sessionId: string,
  screenId: string,
): Promise<ViewerComponent[]> {
  const components: ViewerComponent[] = layoutPlan.components.map((cp) => ({
    id: crypto.randomUUID(),
    name: cp.name,
    status: "pending" as const,
    variants: [],
    prompt: cp.designGuidance,
    agentId: `builder-${cp.order}`,
    iteration: 0,
    order: cp.order,
  }));

  const buildPromises = layoutPlan.components.map(async (componentPlan, i) => {
    const component = components[i];
    const agentName = `builder-${componentPlan.order}`;
    const builderAgent = createBuilderAgent(componentPlan, designSystem);

    const mcpServer = createSdkMcpServer({
      name: "avv-tools",
      tools: [submitComponentTool],
    });

    const imageTool = createRequestImageTool(component.id, screenId, sessionId);
    const imageServer = createSdkMcpServer({
      name: "avv-image",
      tools: [imageTool],
    });

    const collectedMessages: SDKMessage[] = [];

    try {
      for await (const message of query({
        prompt: `Use the ${agentName} agent to build the "${componentPlan.name}" component using the design system tokens.`,
        options: {
          allowedTools: ["Agent", "mcp__avv-image__request_image"],
          agents: { [agentName]: builderAgent },
          mcpServers: { "avv-image": imageServer, "avv-tools": mcpServer },
          maxTurns: 10,
          thinking: { type: "enabled", budgetTokens: 10000 },
          effort: "high",
        },
      })) {
        collectedMessages.push(message);
      }

      const results = extractAllComponentResults(collectedMessages);
      if (results.length > 0) {
        const now = new Date().toISOString();
        component.variants = results.map((r, idx) => ({
          id: crypto.randomUUID(),
          html: r.html,
          css: r.css,
          label: r.variantLabel || `v${idx + 1}`,
          createdAt: now,
        }));
        component.status = "ready";
      } else {
        component.status = "error";
      }
    } catch (err) {
      console.error(`[Layout] Builder ${agentName} failed:`, err);
      component.status = "error";
    }
  });

  await Promise.allSettled(buildPromises);
  return components;
}
