import { useEffect, useRef } from "react";
import type { Message } from "@avv/shared";
import type { StreamingState, PendingPrompt } from "../../hooks/useChat";
import { ThinkingStep } from "./ThinkingStep";
import { ToolCallStep } from "./ToolCallStep";
import { PromptReview } from "./PromptReview";

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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming.text, streaming.toolCalls.length, pendingPrompt]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming assistant response */}
        {streaming.isStreaming && (
          <div className="animate-fade-up space-y-2">
            {streaming.thinkingSteps.map((step, i) => (
              <ThinkingStep key={i} content={step.content} />
            ))}
            {streaming.toolCalls.map((tc) => (
              <ToolCallStep key={tc.id} toolCall={tc} />
            ))}
            {streaming.text && (
              <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                {streaming.text}
                <span className="inline-block w-[2px] h-[18px] bg-[var(--accent-primary)] animate-pulse-soft ml-0.5 align-middle rounded-full" />
              </div>
            )}
            {!streaming.text && streaming.toolCalls.length === 0 && streaming.thinkingSteps.length === 0 && (
              <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)] py-1">
                <span className="flex gap-1">
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
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-[var(--bg-surface)] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-[var(--text-primary)]">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message — clean, no bubble (Claude-style)
  return (
    <div className="space-y-2">
      {message.metadata?.thinkingSteps?.map((step, i) => (
        <ThinkingStep key={i} content={step.content} />
      ))}
      {message.metadata?.toolCalls?.map((tc) => (
        <ToolCallStep key={tc.id} toolCall={tc} />
      ))}
      {message.content && (
        <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      )}
    </div>
  );
}
