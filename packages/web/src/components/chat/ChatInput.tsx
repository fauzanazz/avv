import { useState, useRef, useEffect } from "react";

const MAX_TEXTAREA_HEIGHT = 200;

interface ChatInputProps {
  onSend: (message: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onCancel, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + "px";
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <div className="relative input-glow rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] transition-all duration-200">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (isStreaming) return;
                handleSubmit();
              }
            }}
            placeholder="Describe what you want to build..."
            aria-label="Message input"
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent px-4 py-3 pr-14 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none disabled:opacity-50"
          />
          <div className="absolute right-2 bottom-1.5 flex items-center">
            {isStreaming ? (
              <button
                onClick={onCancel}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--status-error)] hover:bg-[var(--status-error)]/10 transition-colors"
                aria-label="Stop generating"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="10" height="10" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim() || disabled}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2L2 8.5L7 9.5L8.5 14.5L14 2Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[10px] text-[var(--text-muted)] mt-2 opacity-60">
          AVV generates code in a sandboxed environment
        </p>
      </div>
    </div>
  );
}
