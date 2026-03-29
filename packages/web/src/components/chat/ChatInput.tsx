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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        <div className="relative input-glow rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] transition-all duration-200 flex items-end">
          {/* Image upload button — left side */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center ml-1 mb-1 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            aria-label="Attach image"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="3" width="14" height="10" rx="1.5" />
              <circle cx="5.5" cy="7" r="1.25" />
              <path d="M1 10.5l3.5-3 2.5 2.5 2.5-2 3.5 3.5" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

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
            className="flex-1 bg-transparent px-2 py-3 pr-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none disabled:opacity-50"
          />

          {/* Send / cancel button — right side */}
          <div className="flex items-center mr-1 mb-1 flex-shrink-0">
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
                className={[
                  "min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-all duration-200",
                  value.trim() && !disabled
                    ? "bg-[var(--accent-primary)] text-[var(--bg-primary)] hover:bg-[var(--accent-secondary)] hover:scale-105"
                    : "text-[var(--text-muted)] opacity-30 cursor-not-allowed",
                ].join(" ")}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2L2 8.5L7 9.5L8.5 14.5L14 2Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[10px] text-[var(--text-muted)] mt-2.5 opacity-50 flex items-center justify-center gap-1">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60" aria-hidden="true">
            <rect x="2" y="4" width="12" height="10" rx="1.5" />
            <path d="M5 4V3a3 3 0 0 1 6 0v1" />
          </svg>
          Sandboxed environment
        </p>
      </div>
    </div>
  );
}
