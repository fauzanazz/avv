export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  lastMessage?: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface ThinkingStep {
  content: string;
  timestamp: number;
}

export interface ToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  status: "pending" | "running" | "completed" | "error";
}

export interface AgentActivity {
  agent: string;
  status: string;
  detail?: string;
  timestamp: number;
}

export interface MessageMetadata {
  thinkingSteps?: ThinkingStep[];
  toolCalls?: ToolCall[];
  agentActivity?: AgentActivity[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata?: MessageMetadata;
  createdAt: number;
}
