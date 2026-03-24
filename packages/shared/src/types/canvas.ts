export type ComponentStatus = "pending" | "generating" | "ready" | "error";

export interface AVVComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  html: string;
  css: string;
  thumbnail?: string;
  prompt: string;
  agentId: string;
  iteration: number;
  width: number;
  height: number;
  x: number;
  y: number;
}
