import type { Message } from "@avv/shared";
import type { StreamingState, PendingPrompt } from "../../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { PromptReview } from "./PromptReview";

interface ChatPanelProps {
  messages: Message[];
  streaming: StreamingState;
  pendingPrompt: PendingPrompt | null;
  isConnected: boolean;
  onSend: (message: string) => void;
  onCancel: () => void;
  onPromptEdit: (promptId: string, content: string) => void;
  onPromptApprove: (promptId: string) => void;
}

export function ChatPanel({
  messages,
  streaming,
  pendingPrompt,
  isConnected,
  onSend,
  onCancel,
  onPromptEdit,
  onPromptApprove,
}: ChatPanelProps) {
  const isEmpty = messages.length === 0 && !streaming.isStreaming && !pendingPrompt;

  return (
    <main className="flex-1 flex flex-col min-w-0">
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-md">
            <div className="text-4xl text-neutral-700">&#9672;</div>
            <h2 className="text-lg font-medium text-neutral-300">
              What do you want to build?
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Describe a website, app, component, or design. The prompt builder team
              will analyze your request and generate a comprehensive spec.
            </p>
            {!isConnected && (
              <p className="text-xs text-amber-500/70">Connecting to server...</p>
            )}
          </div>
        </div>
      ) : (
        <MessageList
          messages={messages}
          streaming={streaming}
          pendingPrompt={pendingPrompt}
          onPromptEdit={onPromptEdit}
          onPromptApprove={onPromptApprove}
        />
      )}

      <ChatInput
        onSend={onSend}
        onCancel={onCancel}
        isStreaming={streaming.isStreaming}
        disabled={!isConnected}
      />
    </main>
  );
}
