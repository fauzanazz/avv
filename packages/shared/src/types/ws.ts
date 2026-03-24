import type { AVVPage, PageSection, ComponentStatus } from "./canvas";
import type { ImageResult } from "./agent";

/** Server -> Client WebSocket messages */
export type ServerMessage =
  // Page lifecycle
  | { type: "page:created"; page: AVVPage }
  | { type: "page:status"; pageId: string; status: ComponentStatus }
  // Section lifecycle
  | { type: "section:updated"; pageId: string; sectionId: string; updates: Partial<PageSection> }
  | { type: "section:status"; pageId: string; sectionId: string; status: ComponentStatus }
  // Agent activity
  | { type: "agent:log"; agentId: string; message: string }
  | { type: "agent:thinking"; agentId: string; thought: string }
  | { type: "agent:option"; agentId: string; optionId: string; title: string; description: string; previewHtml?: string }
  // Session
  | { type: "session:started"; sessionId: string }
  | { type: "generation:done"; sessionId: string }
  // Images
  | { type: "image:ready"; image: ImageResult }
  | { type: "image:generating"; requestId: string; sectionId: string }
  // Chat / UltraThink
  | { type: "ultrathink:question"; questionId: string; question: string; options?: string[] }
  | { type: "ultrathink:spec"; spec: string }
  | { type: "ultrathink:ready"; enrichedPrompt: string }
  // Errors
  | { type: "error"; message: string };

/** Client -> Server WebSocket messages */
export type ClientMessage =
  | { type: "generate"; prompt: string; mode: "simple" | "ultrathink" }
  | {
      type: "iterate";
      pageId: string;
      sectionId: string;
      sectionName: string;
      currentHtml: string;
      currentCss: string;
      instruction: string;
      iteration: number;
    }
  | { type: "chat"; message: string }
  | { type: "retry"; pageId: string; sectionId: string }
  | { type: "ultrathink:answer"; questionId: string; answer: string }
  | { type: "ultrathink:confirm" }
  | { type: "cancel" };
