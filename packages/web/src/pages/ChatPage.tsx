import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Message, FileEntry } from "@avv/shared";
import type { StreamingState, PendingPrompt, SandboxProgressStep } from "../hooks/useChat";
import { ChatPanel } from "../components/chat/ChatPanel";
import { PreviewPanel } from "../components/preview/PreviewPanel";

type MobileTab = "chat" | "preview";

interface ChatPageProps {
  messages: Message[];
  streaming: StreamingState;
  pendingPrompt: PendingPrompt | null;
  isConnected: boolean;
  files: FileEntry[];
  fileContents: Map<string, string>;
  previewUrl: string | null;
  refreshTrigger: number;
  sandboxProgress: SandboxProgressStep[] | null;
  activeConversationId: string | null;
  onSend: (message: string) => void;
  onCancel: () => void;
  onPromptEdit: (promptId: string, content: string) => void;
  onPromptApprove: (promptId: string) => void;
  onLoadConversation: (id: string) => void;
}

export function ChatPage({
  messages,
  streaming,
  pendingPrompt,
  isConnected,
  files,
  fileContents,
  previewUrl,
  refreshTrigger,
  sandboxProgress,
  activeConversationId,
  onSend,
  onCancel,
  onPromptEdit,
  onPromptApprove,
  onLoadConversation,
}: ChatPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  // Load conversation when URL param changes
  useEffect(() => {
    if (id && isConnected && id !== activeConversationId) {
      onLoadConversation(id);
    }
  }, [id, isConnected, activeConversationId, onLoadConversation]);

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Mobile top bar */}
      <div className="flex-none border-b border-[var(--border-subtle)] px-4 py-2.5 flex items-center gap-3 md:hidden">
        <button
          onClick={() => navigate("/")}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          {"\u2190"} Conversations
        </button>
        <span className="text-xs text-[var(--border-default)]" aria-hidden="true">|</span>
        <div role="tablist" className="flex items-center gap-3">
          <button
            role="tab"
            aria-selected={mobileTab === "chat"}
            onClick={() => setMobileTab("chat")}
            className={`text-xs transition-colors ${mobileTab === "chat" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
          >
            Chat
          </button>
          <button
            role="tab"
            aria-selected={mobileTab === "preview"}
            onClick={() => setMobileTab("preview")}
            className={`text-xs transition-colors ${mobileTab === "preview" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Chat panel */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${mobileTab !== "chat" ? "hidden md:flex" : ""}`}>
        {/* Desktop back bar */}
        <div className="hidden md:flex border-b border-[var(--border-subtle)] px-4 py-2.5 items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {"\u2190"} Conversations
          </button>
        </div>
        <ChatPanel
          messages={messages}
          streaming={streaming}
          pendingPrompt={pendingPrompt}
          isConnected={isConnected}
          onSend={onSend}
          onCancel={onCancel}
          onPromptEdit={onPromptEdit}
          onPromptApprove={onPromptApprove}
        />
      </div>

      {/* Preview panel */}
      <div className={`flex-1 md:flex-none ${mobileTab !== "preview" ? "hidden md:flex" : "flex"}`}>
        <PreviewPanel
          files={files}
          fileContents={fileContents}
          previewUrl={previewUrl}
          refreshTrigger={refreshTrigger}
          sandboxProgress={sandboxProgress}
        />
      </div>
    </div>
  );
}
