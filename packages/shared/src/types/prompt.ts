export type PromptBuilderAgent =
  | "design-engineer"
  | "ux-engineer"
  | "animation-engineer"
  | "artist-engineer"
  | "typewriter";

export interface AgentOutput {
  agent: PromptBuilderAgent;
  output: string;
  timestamp: number;
}

export interface Prompt {
  id: string;
  conversationId: string;
  title: string;
  content: string;
  agentsOutput: AgentOutput[];
  createdAt: number;
  updatedAt: number;
}

export interface PromptBuilderState {
  status: "idle" | "building" | "review" | "approved";
  activeAgent?: PromptBuilderAgent;
  outputs: Partial<Record<PromptBuilderAgent, string>>;
  mergedPrompt?: string;
}
