export type ComponentStatus = "pending" | "generating" | "ready" | "error";

export interface ComponentVariant {
  id: string;
  html: string;
  css: string;
  label: string;
  createdAt: string;
}

export interface ViewerComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  variants: ComponentVariant[];
  prompt: string;
  agentId: string;
  iteration: number;
  order: number;
}

export interface GenerationSession {
  id: string;
  title: string;
  status: ComponentStatus;
  components: ViewerComponent[];
  prompt: string;
  mode: "simple" | "ultrathink";
  createdAt: string;
}
