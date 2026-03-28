import { useState } from "react";

interface ThinkingStepProps {
  content: string;
}

export function ThinkingStep({ content }: ThinkingStepProps) {
  const [expanded, setExpanded] = useState(false);

  const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;

  return (
    <div
      className="my-1 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-amber-500/70">Thinking</span>
      </div>
      {expanded ? (
        <pre className="mt-1 ml-5 text-xs text-neutral-500 whitespace-pre-wrap font-mono leading-relaxed">
          {content}
        </pre>
      ) : (
        <p className="ml-5 text-xs text-neutral-600 truncate">{preview}</p>
      )}
    </div>
  );
}
