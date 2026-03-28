import type {
  Conversation,
  ConversationSummary,
  Message,
} from "./conversation";
import type { FileEntry, FileAction } from "./files";
import type { PromptBuilderAgent } from "./prompt";

export type SandboxStep = "boot" | "upload" | "install" | "vite" | "connect";
export type SandboxStepStatus = "pending" | "running" | "done" | "error";

// ── Server -> Client ─────────────────────────────────────────

export type ServerMessage =
  | { type: "chat:text"; conversationId: string; content: string; streaming: boolean }
  | { type: "chat:thinking"; conversationId: string; content: string }
  | {
      type: "chat:tool_call";
      conversationId: string;
      callId: string;
      tool: string;
      args: Record<string, unknown>;
      result?: string;
      status: "pending" | "running" | "completed" | "error";
    }
  | { type: "chat:done"; conversationId: string; messageId: string }
  | { type: "chat:error"; conversationId: string; error: string }
  | {
      type: "agent:activity";
      agent: PromptBuilderAgent | "orchestrator" | "router";
      status: string;
      detail?: string;
    }
  | { type: "prompt:building"; agent: PromptBuilderAgent; output: string }
  | {
      type: "prompt:complete";
      promptId: string;
      content: string;
      agentsOutput: Record<string, string>;
    }
  | {
      type: "file:changed";
      path: string;
      content: string;
      action: FileAction;
    }
  | { type: "file:tree"; files: FileEntry[] }
  | { type: "preview:ready"; url: string }
  | {
      type: "sandbox:progress";
      conversationId: string;
      step: SandboxStep;
      status: SandboxStepStatus;
      error?: string;
    }
  | {
      type: "github:status";
      status: "connecting" | "pushing" | "done" | "error";
      repo?: string;
      error?: string;
    }
  | {
      type: "conversation:loaded";
      conversation: Conversation;
      messages: Message[];
    }
  | { type: "conversations:list"; conversations: ConversationSummary[] }
  | { type: "error"; message: string };

// ── Client -> Server ─────────────────────────────────────────

export type ClientMessage =
  | { type: "chat:send"; conversationId?: string; message: string }
  | { type: "chat:cancel" }
  | { type: "prompt:edit"; promptId: string; content: string }
  | { type: "prompt:approve"; promptId: string }
  | { type: "conversation:load"; conversationId: string }
  | { type: "conversation:list" }
  | { type: "conversation:new" }
  | { type: "conversation:delete"; conversationId: string }
  | { type: "conversation:rename"; conversationId: string; title: string }
  | { type: "github:connect"; token: string }
  | { type: "github:push"; projectId: string; repo?: string }
  | { type: "settings:update"; key: string; value: unknown };
