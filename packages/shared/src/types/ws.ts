import type { GenerationSession, ViewerComponent, ComponentStatus } from "./canvas";
import type { ImageResult } from "./agent";

/** Server -> Client WebSocket messages */
export type ServerMessage =
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
  | { type: "generate"; prompt: string; mode: "simple" | "ultrathink" }
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
  | { type: "chat"; message: string }
  | { type: "retry"; sessionId: string; componentId: string }
  | { type: "ultrathink:answer"; questionId: string; answer: string }
  | { type: "ultrathink:confirm" }
  | { type: "cancel" };
