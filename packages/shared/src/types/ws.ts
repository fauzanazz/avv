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
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "generate"; prompt: string; mode: "simple" | "ultrathink" }
  | { type: "iterate"; componentId: string; instruction: string }
  | { type: "cancel"; sessionId: string };
