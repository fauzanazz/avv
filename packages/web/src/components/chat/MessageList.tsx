import { useRef, useEffect, memo } from "react";
import type { Message } from "@avv/shared";
import type { StreamingState, PendingPrompt } from "../../hooks/useChat";
import { useSmartScroll } from "../../hooks/useSmartScroll";
import { ThinkingStep } from "./ThinkingStep";
import { ToolCallStep } from "./ToolCallStep";
import { PromptReview } from "./PromptReview";
import { MarkdownContent } from "./MarkdownContent";
import { formatTime } from "../../utils/formatTime";

interface MessageListProps {
  messages: Message[];
  streaming: StreamingState;
  pendingPrompt: PendingPrompt | null;
  onPromptEdit: (promptId: string, content: string) => void;
  onPromptApprove: (promptId: string) => void;
}

export function MessageList({
  messages,
  streaming,
  pendingPrompt,
  onPromptEdit,
  onPromptApprove,
}: MessageListProps) {
  const streamingStartTime = useRef<number>(0);

  useEffect(() => {
    if (streaming.isStreaming && streamingStartTime.current === 0) {
      streamingStartTime.current = Date.now();
    } else if (!streaming.isStreaming) {
      streamingStartTime.current = 0;
    }
  }, [streaming.isStreaming]);

  const { containerRef, bottomRef, isAtBottom, scrollToBottom } = useSmartScroll([
    messages.length,
    streaming.text,
    streaming.toolCalls.length,
    pendingPrompt,
  ]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming assistant response */}
        {streaming.isStreaming && (
          <div className="animate-fade-up space-y-2">
            <time dateTime={new Date(streamingStartTime.current || Date.now()).toISOString()} className="text-[10px] text-[var(--text-muted)]">
              {formatTime(streamingStartTime.current || Date.now())}
            </time>
            {streaming.thinkingSteps.map((step, i) => (
              <ThinkingStep key={i} content={step.content} />
            ))}
            {streaming.toolCalls.map((tc) => (
              <ToolCallStep key={tc.id} toolCall={tc} />
            ))}
            {streaming.text && (
              <MarkdownContent content={streaming.text} isStreaming />
            )}
            {!streaming.text && streaming.toolCalls.length === 0 && streaming.thinkingSteps.length === 0 && (
              <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)] py-1" role="status" aria-label="Loading response">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse-soft" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse-soft" style={{ animationDelay: "200ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse-soft" style={{ animationDelay: "400ms" }} />
                </span>
              </div>
            )}
          </div>
        )}

        {/* Pending prompt review */}
        {pendingPrompt && (
          <PromptReview
            promptId={pendingPrompt.promptId}
            content={pendingPrompt.content}
            agentsOutput={pendingPrompt.agentsOutput}
            onEdit={onPromptEdit}
            onApprove={onPromptApprove}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom FAB */}
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-4 left-1/2 -translate-x-1/2 mx-auto block min-h-[44px] px-4 py-2.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] text-xs shadow-lg hover:bg-[var(--bg-surface)] transition-colors animate-fade-up"
          aria-label="Scroll to bottom"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="inline-block mr-1 align-[-2px]"
            aria-hidden="true"
          >
            <path d="M8 3v10M4 9l4 4 4-4" />
          </svg>
          New messages
        </button>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  const timestamp = (
    <time dateTime={new Date(message.createdAt).toISOString()} className="text-[10px] text-[var(--text-muted)]">
      {formatTime(message.createdAt)}
    </time>
  );

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[80%] bg-[var(--bg-surface)] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-[var(--text-primary)]">
          {message.content}
        </div>
        {timestamp}
      </div>
    );
  }

  // Assistant message — clean, no bubble (Claude-style)
  return (
    <div className="space-y-2">
      {timestamp}
      {message.metadata?.thinkingSteps?.map((step, i) => (
        <ThinkingStep key={i} content={step.content} />
      ))}
      {message.metadata?.toolCalls?.map((tc) => (
        <ToolCallStep key={tc.id} toolCall={tc} />
      ))}
      {message.content && (
        <MarkdownContent content={message.content} />
      )}
    </div>
  );
});
