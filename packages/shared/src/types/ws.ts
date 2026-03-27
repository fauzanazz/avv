import type { GenerationSession, ViewerComponent, ComponentStatus } from "./canvas";
import type { ImageResult } from "./agent";
import type { DesignSystem, DesignTokens } from "./design-system";
import type { Project, Screen, LayoutOption } from "./project";

/** Server -> Client WebSocket messages */
export type ServerMessage =
  // Project lifecycle
  | { type: "project:created"; project: Project }
  // Design system
  | { type: "designsystem:options"; options: DesignSystem[] }
  | { type: "designsystem:selected"; designSystem: DesignSystem }
  | { type: "designsystem:updated"; designSystem: DesignSystem }
  // Screens
  | { type: "screen:created"; screen: Screen }
  | { type: "screen:updated"; screenId: string; updates: Partial<Screen> }
  // Layouts
  | { type: "layout:options"; screenId: string; options: LayoutOption[] }
  | { type: "layout:selected"; screenId: string; layoutId: string }
  // Generation lifecycle
  | { type: "generation:created"; session: GenerationSession }
  | { type: "generation:status"; sessionId: string; status: ComponentStatus }
  // Component lifecycle
  | { type: "component:updated"; sessionId: string; componentId: string; updates: Partial<ViewerComponent> }
  | { type: "component:status"; sessionId: string; componentId: string; status: ComponentStatus }
  // Agent activity
  | { type: "agent:log"; agentId: string; message: string }
  | { type: "agent:thinking"; agentId: string; thought: string }
  | { type: "agent:option"; agentId: string; optionId: string; title: string; description: string; previewHtml?: string }
  // Session
  | { type: "session:started"; sessionId: string }
  | { type: "generation:done"; sessionId: string }
  // Images
  | { type: "image:ready"; image: ImageResult }
  | { type: "image:generating"; requestId: string; componentId: string }
  // Chat / UltraThink
  | { type: "ultrathink:question"; questionId: string; question: string; options?: string[] }
  | { type: "ultrathink:spec"; spec: string }
  | { type: "ultrathink:ready"; enrichedPrompt: string }
  // Figma
  | { type: "figma:pushing"; message: string }
  | { type: "figma:pushed"; figmaUrl: string }
  | { type: "figma:error"; message: string }
  // Errors
  | { type: "error"; message: string };

/** Client -> Server WebSocket messages */
export type ClientMessage =
  | { type: "generate"; prompt: string }
  | { type: "chat"; message: string }
  | { type: "select:designsystem"; designSystemId: string }
  | { type: "update:designsystem"; tokens: Partial<DesignTokens> }
  | { type: "select:layout"; screenId: string; layoutId: string }
  | { type: "add:screen"; prompt: string }
  | { type: "edit:screen"; screenId: string; instruction: string }
  | { type: "regenerate:layouts"; screenId: string }
  | { type: "regenerate:designsystem" }
  | { type: "figma:fetch"; figmaUrl: string; nodeId?: string }
  | { type: "figma:import"; figmaUrl: string; nodeId?: string }
  | {
      type: "iterate";
      sessionId: string;
      componentId: string;
      componentName: string;
      currentHtml: string;
      currentCss: string;
      instruction: string;
      iteration: number;
    }
  | { type: "retry"; sessionId: string; componentId: string }
  | { type: "cancel" };
