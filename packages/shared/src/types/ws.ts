import type { AVVComponent, ComponentStatus } from "./canvas";
import type { ImageResult } from "./agent";

export type ServerMessage =
  | { type: "session:started"; sessionId: string }
  | { type: "component:created"; component: AVVComponent }
  | { type: "component:updated"; componentId: string; updates: Omit<Partial<AVVComponent>, "id"> }
  | { type: "component:status"; componentId: string; status: ComponentStatus }
  | { type: "agent:log"; agentId: string; message: string }
  | { type: "generation:done"; sessionId: string }
  | { type: "image:ready"; image: ImageResult }
  | { type: "image:generating"; requestId: string; componentId: string }
<<<<<<< HEAD
  | { type: "ultrathink:question"; questionId: string; question: string; options?: string[] }
  | { type: "ultrathink:spec"; spec: string }
  | { type: "ultrathink:ready"; enrichedPrompt: string }
=======
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "generate"; prompt: string; mode: "simple" | "ultrathink" }
  | { type: "iterate"; componentId: string; instruction: string }
  | { type: "ultrathink:answer"; questionId: string; answer: string }
  | { type: "ultrathink:confirm" }
  | { type: "cancel"; sessionId: string };
