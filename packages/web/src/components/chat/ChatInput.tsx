import { useState, useRef, useEffect } from "react";

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
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="border-t border-neutral-800 p-4">
      <div className="relative">
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
          disabled={disabled}
          rows={1}
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 pr-20 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500 resize-none disabled:opacity-50"
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          {isStreaming ? (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-900/50 text-red-300 hover:bg-red-900/80 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-700 text-neutral-200 hover:bg-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
