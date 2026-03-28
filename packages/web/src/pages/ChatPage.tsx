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
    <div className="h-screen w-screen flex flex-col md:flex-row bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <div className="flex-none border-b border-neutral-800 px-4 py-2 flex items-center gap-3 md:hidden">
        <button
          onClick={() => navigate("/")}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          {"\u2190"} Back
        </button>
        <span className="text-xs text-neutral-600">|</span>
        <button
          onClick={() => setMobileTab("chat")}
          className={`text-xs transition-colors ${mobileTab === "chat" ? "text-neutral-200" : "text-neutral-500"}`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileTab("preview")}
          className={`text-xs transition-colors ${mobileTab === "preview" ? "text-neutral-200" : "text-neutral-500"}`}
        >
          Preview
        </button>
      </div>

      {/* Chat panel — full width on mobile when active, flex-1 on desktop */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${mobileTab !== "chat" ? "hidden md:flex" : ""}`}>
        {/* Desktop-only back bar */}
        <div className="hidden md:flex border-b border-neutral-800 px-4 py-2 items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {"\u2190"} Back
          </button>
          <span className="text-xs text-neutral-600">|</span>
          <span className="text-xs text-neutral-400 truncate">
            {activeConversationId === id ? "Chat" : "Loading..."}
          </span>
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

      {/* Preview panel — full width on mobile when active, fixed width on desktop */}
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
