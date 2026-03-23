import type { TLBaseShape } from "tldraw";

export const AVV_COMPONENT_TYPE = "avv-component" as const;

export interface AVVComponentProps {
  w: number;
  h: number;
  name: string;
  status: "pending" | "generating" | "ready" | "error";
  html: string;
  css: string;
  prompt: string;
  agentId: string;
  iteration: number;
}

export type AVVComponentShape = TLBaseShape<typeof AVV_COMPONENT_TYPE, AVVComponentProps>;
