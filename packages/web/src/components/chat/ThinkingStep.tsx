import { useState } from "react";

interface ThinkingStepProps {
  content: string;
}

export function ThinkingStep({ content }: ThinkingStepProps) {
  const [expanded, setExpanded] = useState(false);

  const preview = content.length > 120 ? content.slice(0, 120) + "\u2026" : content;

  return (
    <div
      className="cursor-pointer group"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 16 16"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="text-amber-500/60 text-[11px]">Thinking</span>
      </div>
      {expanded ? (
        <pre className="mt-1.5 ml-5 text-xs text-[var(--text-tertiary)] whitespace-pre-wrap font-mono leading-relaxed bg-[var(--bg-secondary)] rounded-lg p-3">
          {content}
        </pre>
      ) : (
        <p className="ml-5 text-[11px] text-[var(--text-muted)] truncate group-hover:text-[var(--text-tertiary)] transition-colors">
          {preview}
        </p>
      )}
    </div>
  );
}
