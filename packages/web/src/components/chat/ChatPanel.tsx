import type { Message } from "@avv/shared";
import type { StreamingState, PendingPrompt } from "../../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

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
    <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-4 max-w-lg">
            <div className="text-5xl opacity-10 select-none mb-2">{"\u2726"}</div>
            <h2 className="text-xl font-medium text-[var(--text-primary)] tracking-tight">
              What do you want to build?
            </h2>
            <p className="text-sm text-[var(--text-tertiary)] leading-relaxed max-w-sm mx-auto">
              Describe a website, app, or component. AVV will design and build it
              in a sandboxed environment with live preview.
            </p>
            {!isConnected && (
              <p className="text-xs text-amber-500/70 mt-2">Connecting to server...</p>
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
