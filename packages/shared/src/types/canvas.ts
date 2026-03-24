export type ComponentStatus = "pending" | "generating" | "ready" | "error";

/** A section within a page (nav, hero, features, etc.) */
export interface PageSection {
  id: string;
  name: string;
  status: ComponentStatus;
  html: string;
  css: string;
  prompt: string;
  agentId: string;
  iteration: number;
  order: number;
}

/** A full page on the canvas — one tldraw shape */
export interface AVVPage {
  id: string;
  title: string;
  status: ComponentStatus;
  sections: PageSection[];
  prompt: string;
  mode: "simple" | "ultrathink";
  createdAt: string;
}

/** @deprecated — use AVVPage + PageSection instead */
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
