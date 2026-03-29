import { useState } from "react";
import type { ThinkingStep } from "@avv/shared";

interface ThinkingIndicatorProps {
  steps: ThinkingStep[];
}

export function ThinkingIndicator({ steps }: ThinkingIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  const durationLabel = (() => {
    if (steps.length < 2) return "Thinking";
    const first = steps[0].timestamp;
    const last = steps[steps.length - 1].timestamp;
    const seconds = Math.round((last - first) / 1000);
    if (seconds <= 0) return "Thinking";
    return `Thought for ${seconds}s`;
  })();

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer w-full text-left min-h-[44px] py-1"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse thinking" : "Expand thinking"}
      >
        {/* Brain/thought icon */}
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--status-warning)]"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 2a3 3 0 0 0-1 5.83V13a1 1 0 0 0 2 0V7.83A3 3 0 0 0 6 2z" />
          <path d="M10 2a3 3 0 0 1 1 5.83V13a1 1 0 0 1-2 0V7.83A3 3 0 0 1 10 2z" />
          <path d="M6 5a3 3 0 0 1 4 0" />
        </svg>
        <span>{durationLabel}</span>
        {/* Chevron */}
        <svg
          className={`w-3 h-3 ml-0.5 flex-shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-1 max-h-60 overflow-y-auto bg-[var(--bg-secondary)] rounded-lg p-3">
          {steps.map((step, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="my-2 border-t border-[var(--border-default)] opacity-40" aria-hidden="true" />
              )}
              <pre className="text-xs text-[var(--text-tertiary)] font-mono whitespace-pre-wrap leading-relaxed">
                {step.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
