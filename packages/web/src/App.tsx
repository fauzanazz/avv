import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import type { ServerMessage } from "@avv/shared";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useChat } from "./hooks/useChat";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ChatPage } from "./pages/ChatPage";
import { SettingsModal } from "./components/SettingsModal";
import { Toast } from "./components/Toast";

function AppRoutes() {
  const {
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

  const navigate = useNavigate();

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleChatMessage(msg);

      // Navigate to chat page when a new conversation is created
      if (msg.type === "conversation:loaded") {
        navigate(`/chat/${msg.conversation.id}`, { replace: true });
      }

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
    [handleChatMessage, navigate],
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

  const handleLoadConversation = useCallback(
    (id: string) => send({ type: "conversation:load", conversationId: id }),
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
    <>
      <Routes>
        <Route
          path="/"
          element={
            <ConversationsPage
              conversations={conversations}
              isConnected={isConnected}
              onNew={handleNewConversation}
              onDelete={handleDeleteConversation}
              onRename={handleRenameConversation}
              onOpenSettings={() => setShowSettings(true)}
            />
          }
        />
        <Route
          path="/chat/:id"
          element={
            <ChatPage
              messages={messages}
              streaming={streaming}
              pendingPrompt={pendingPrompt}
              isConnected={isConnected}
              files={files}
              fileContents={fileContents}
              previewUrl={previewUrl}
              refreshTrigger={refreshTrigger}
              sandboxProgress={sandboxProgress}
              activeConversationId={activeConversation?.id ?? null}
              onSend={handleSend}
              onCancel={handleCancel}
              onPromptEdit={handlePromptEdit}
              onPromptApprove={handlePromptApprove}
              onLoadConversation={handleLoadConversation}
            />
          }
        />
      </Routes>

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
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
