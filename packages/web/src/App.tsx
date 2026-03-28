import { useCallback, useEffect, useState } from "react";
import type { ServerMessage } from "@avv/shared";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useChat } from "./hooks/useChat";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { PreviewPanel } from "./components/preview/PreviewPanel";
import { SettingsModal } from "./components/SettingsModal";
import { Toast } from "./components/Toast";

export function App() {
  const {
    conversations,
    activeConversation,
    messages,
    streaming,
    files,
    fileContents,
    pendingPrompt,
    previewUrl,
    handleMessage: handleChatMessage,
    addUserMessage,
    clearPendingPrompt,
  } = useChat();

  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);
  const [githubStatus, setGithubStatus] = useState<{
    connected: boolean;
    username?: string;
    error?: string;
  }>({ connected: false });

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleChatMessage(msg);

      // Handle GitHub status
      if (msg.type === "github:status") {
        if (msg.status === "done") {
          setGithubStatus({ connected: true, username: msg.repo });
          setToast({ message: msg.repo ? `Connected: ${msg.repo}` : "GitHub connected", type: "success" });
        } else if (msg.status === "error") {
          setGithubStatus((prev) => ({ ...prev, error: msg.error }));
          setToast({ message: msg.error ?? "GitHub error", type: "error" });
        }
      }

      // Show errors as toasts
      if (msg.type === "error") {
        setToast({ message: msg.message, type: "error" });
      }
      if (msg.type === "chat:error") {
        setToast({ message: msg.error, type: "error" });
      }
    },
    [handleChatMessage],
  );

  const { send, isConnected } = useAVVWebSocket({ onMessage });

  useEffect(() => {
    if (isConnected) {
      send({ type: "conversation:list" });
    }
  }, [isConnected, send]);

  const handleSend = useCallback(
    (message: string) => {
      const cid = activeConversation?.id;
      if (cid) addUserMessage(cid, message);
      send({ type: "chat:send", conversationId: cid ?? undefined, message });
    },
    [send, activeConversation, addUserMessage],
  );

  const handleCancel = useCallback(() => {
    send({ type: "chat:cancel" });
  }, [send]);

  const handleSelectConversation = useCallback(
    (id: string) => send({ type: "conversation:load", conversationId: id }),
    [send],
  );

  const handleNewConversation = useCallback(
    () => send({ type: "conversation:new" }),
    [send],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => send({ type: "conversation:delete", conversationId: id }),
    [send],
  );

  const handleRenameConversation = useCallback(
    (id: string, title: string) => send({ type: "conversation:rename", conversationId: id, title }),
    [send],
  );

  const handlePromptEdit = useCallback(
    (promptId: string, content: string) => send({ type: "prompt:edit", promptId, content }),
    [send],
  );

  const handlePromptApprove = useCallback(
    (promptId: string) => {
      clearPendingPrompt();
      send({ type: "prompt:approve", promptId });
    },
    [send, clearPendingPrompt],
  );

  const handleConnectGitHub = useCallback(
    (token: string) => send({ type: "github:connect", token }),
    [send],
  );

  return (
    <div className="h-screen w-screen flex bg-neutral-950 text-neutral-100">
      <Sidebar
        conversations={conversations}
        activeId={activeConversation?.id ?? null}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        onOpenSettings={() => setShowSettings(true)}
      />
      <ChatPanel
        messages={messages}
        streaming={streaming}
        pendingPrompt={pendingPrompt}
        isConnected={isConnected}
        onSend={handleSend}
        onCancel={handleCancel}
        onPromptEdit={handlePromptEdit}
        onPromptApprove={handlePromptApprove}
      />
      <PreviewPanel files={files} fileContents={fileContents} previewUrl={previewUrl} />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onConnectGitHub={handleConnectGitHub}
        githubStatus={githubStatus}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
