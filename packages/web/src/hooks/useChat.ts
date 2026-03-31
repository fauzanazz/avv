import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ServerMessage,
  Message,
  Conversation,
  ConversationSummary,
  FileEntry,
  ThinkingStep,
  ToolCall,
  SandboxStep,
  SandboxStepStatus,
} from "@avv/shared";

export interface StreamingState {
  text: string;
  thinkingSteps: ThinkingStep[];
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

export interface PendingPrompt {
  promptId: string;
  content: string;
  agentsOutput: Record<string, string>;
}

export interface SandboxProgressStep {
  step: SandboxStep;
  status: SandboxStepStatus;
  error?: string;
}

export interface ChatState {
  conversations: ConversationSummary[];
  activeConversation: Conversation | null;
  messages: Message[];
  streaming: StreamingState;
}

const INITIAL_STREAMING: StreamingState = {
  text: "",
  thinkingSteps: [],
  toolCalls: [],
  isStreaming: false,
};

export function useChat() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>(INITIAL_STREAMING);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sandboxProgress, setSandboxProgress] = useState<SandboxProgressStep[] | null>(null);

  // Safety-net: auto-dismiss sandbox progress if stuck for >3 minutes
  useEffect(() => {
    if (!sandboxProgress) return;
    const timer = setTimeout(() => setSandboxProgress(null), 3 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [sandboxProgress]);

  // Use ref for streaming text to avoid closure staling during rapid updates
  const streamTextRef = useRef("");
  const toolCallsRef = useRef<ToolCall[]>([]);
  const thinkingRef = useRef<ThinkingStep[]>([]);
  const lastEventTypeRef = useRef<string>("");

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "conversations:list":
        setConversations(msg.conversations);
        break;

      case "conversation:loaded":
        setActiveConversation(msg.conversation);
        setMessages(msg.messages);
        // Add to conversation list if not already there
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === msg.conversation.id);
          if (exists) return prev;
          return [
            { id: msg.conversation.id, title: msg.conversation.title, updatedAt: msg.conversation.updatedAt },
            ...prev,
          ];
        });
        // Reset streaming state
        streamTextRef.current = "";
        toolCallsRef.current = [];
        thinkingRef.current = [];
        setStreaming(INITIAL_STREAMING);
        break;

      case "chat:text":
        if (msg.streaming) {
          streamTextRef.current += msg.content;
          lastEventTypeRef.current = "chat:text";
          setStreaming((s) => ({
            ...s,
            text: streamTextRef.current,
            isStreaming: true,
          }));
        }
        break;

      case "chat:thinking": {
        const steps = thinkingRef.current;
        const last = steps[steps.length - 1];
        // Start a new step if last event was not thinking (e.g., a tool call interrupted)
        if (last && lastEventTypeRef.current === "chat:thinking") {
          thinkingRef.current = [
            ...steps.slice(0, -1),
            { ...last, content: last.content + msg.content },
          ];
        } else {
          thinkingRef.current = [...steps, { content: msg.content, timestamp: Date.now() }];
        }
        lastEventTypeRef.current = "chat:thinking";
        setStreaming((s) => ({
          ...s,
          thinkingSteps: thinkingRef.current,
          isStreaming: true,
        }));
        break;
      }

      case "chat:tool_call": {
        lastEventTypeRef.current = "chat:tool_call";
        const idx = toolCallsRef.current.findIndex((t) => t.id === msg.callId);
        if (idx >= 0) {
          toolCallsRef.current = toolCallsRef.current.map((t, i) =>
            i === idx
              ? { ...t, status: msg.status, result: msg.result ?? t.result }
              : t,
          );
        } else {
          toolCallsRef.current = [
            ...toolCallsRef.current,
            {
              id: msg.callId,
              tool: msg.tool,
              args: msg.args,
              result: msg.result,
              status: msg.status,
            },
          ];
        }
        setStreaming((s) => ({
          ...s,
          toolCalls: toolCallsRef.current,
          isStreaming: true,
        }));
        break;
      }

      case "chat:done": {
        // Finalize: create a message from accumulated streaming data
        if (streamTextRef.current) {
          const assistantMsg: Message = {
            id: msg.messageId || crypto.randomUUID(),
            conversationId: msg.conversationId,
            role: "assistant",
            content: streamTextRef.current,
            metadata: {
              ...(thinkingRef.current.length > 0
                ? { thinkingSteps: thinkingRef.current }
                : {}),
              ...(toolCallsRef.current.length > 0
                ? { toolCalls: toolCallsRef.current }
                : {}),
            },
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
        // Reset streaming
        streamTextRef.current = "";
        toolCallsRef.current = [];
        thinkingRef.current = [];
        setStreaming(INITIAL_STREAMING);
        break;
      }

      case "chat:error":
        setStreaming((s) => ({ ...s, isStreaming: false }));
        break;

      case "prompt:complete": {
        // Add prompt card to message history so it persists across reloads
        const promptMsg: Message = {
          id: crypto.randomUUID(),
          conversationId: msg.conversationId,
          role: "assistant",
          content: msg.content,
          metadata: {
            type: "prompt",
            promptId: msg.promptId,
            promptContent: msg.content,
            agentsOutput: Object.entries(msg.agentsOutput).map(
              ([agent, output]) => ({
                agent: agent as import("@avv/shared").PromptBuilderAgent,
                output,
                timestamp: Date.now(),
              }),
            ),
          },
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, promptMsg]);
        setPendingPrompt({
          promptId: msg.promptId,
          content: msg.content,
          agentsOutput: msg.agentsOutput,
        });
        setStreaming(INITIAL_STREAMING);
        break;
      }

      case "preview:ready":
        setPreviewUrl(msg.url);
        break;

      case "sandbox:progress": {
        const ALL_STEPS: SandboxStep[] = ["boot", "upload", "install", "connect", "vite"];
        // Clear progress once the final step (vite) completes or any step errors
        if ((msg.step === "vite" && msg.status === "done") || msg.status === "error") {
          setSandboxProgress((prev) => {
            const steps: SandboxProgressStep[] = prev ??
              ALL_STEPS.map((s) => ({ step: s, status: "pending" as SandboxStepStatus }));
            const updated = steps.map((s) =>
              s.step === msg.step ? { ...s, status: msg.status, error: msg.error } : s,
            );
            if (msg.status === "done") return null;
            return updated;
          });
          // Auto-dismiss progress after error so the fallback preview can show
          if (msg.status === "error") {
            setTimeout(() => setSandboxProgress(null), 3000);
          }
          break;
        }
        setSandboxProgress((prev) => {
          const steps: SandboxProgressStep[] = prev ??
            ALL_STEPS.map((s) => ({ step: s, status: "pending" as SandboxStepStatus }));
          return steps.map((s) =>
            s.step === msg.step ? { ...s, status: msg.status, error: msg.error } : s,
          );
        });
        break;
      }

      case "file:tree":
        setFiles(msg.files);
        break;

      case "file:changed":
        setFileContents((prev) => {
          const next = new Map(prev);
          if (msg.action === "deleted") {
            next.delete(msg.path);
          } else {
            next.set(msg.path, msg.content);
          }
          return next;
        });
        setRefreshTrigger((n) => n + 1);
        break;

      case "error":
        setStreaming((s) => ({ ...s, isStreaming: false }));
        break;
    }
  }, []);

  const addUserMessage = useCallback(
    (conversationId: string, content: string) => {
      const userMsg: Message = {
        id: crypto.randomUUID(),
        conversationId,
        role: "user",
        content,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      // Start streaming state
      streamTextRef.current = "";
      toolCallsRef.current = [];
      thinkingRef.current = [];
      setStreaming({ ...INITIAL_STREAMING, isStreaming: true });
    },
    [],
  );

  return {
    conversations,
    activeConversation,
    messages,
    streaming,
    files,
    fileContents,
    pendingPrompt,
    previewUrl,
    refreshTrigger,
    sandboxProgress,
    handleMessage,
    addUserMessage,
    setActiveConversation,
    clearPendingPrompt: () => setPendingPrompt(null),
  };
}
