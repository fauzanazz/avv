import { useState } from "react";
import type { ToolCall } from "@avv/shared";

interface ToolCallStepProps {
  toolCall: ToolCall;
}

export function ToolCallStep({ toolCall }: ToolCallStepProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="cursor-pointer group"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-xs">
        <StatusIcon status={toolCall.status} />
        <span className="text-[var(--text-tertiary)] font-mono text-[11px]">
          {toolCall.tool || "tool"}
        </span>
        {toolCall.status === "running" && (
          <span className="text-blue-400/50 text-[11px] animate-pulse-soft">running</span>
        )}
      </div>
      {expanded && (
        <div className="ml-5 mt-1.5 space-y-1.5">
          {Object.keys(toolCall.args).length > 0 && (
            <pre className="text-[11px] text-[var(--text-muted)] whitespace-pre-wrap font-mono bg-[var(--bg-secondary)] rounded-lg p-2.5 leading-relaxed">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          )}
          {toolCall.result && (
            <pre className="text-[11px] text-[var(--text-tertiary)] whitespace-pre-wrap font-mono bg-[var(--bg-secondary)] rounded-lg p-2.5 max-h-40 overflow-y-auto leading-relaxed">
              {toolCall.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  const base = "w-3.5 h-3.5 flex-shrink-0";
  switch (status) {
    case "running":
      return (
        <svg className={`${base} text-blue-400 animate-spin`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
        </svg>
      );
    case "completed":
      return (
        <svg className={`${base} text-emerald-400`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 8.5l2.5 2.5 5.5-5.5" />
        </svg>
      );
    case "error":
      return (
        <svg className={`${base} text-red-400`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 5l6 6M11 5l-6 6" />
        </svg>
      );
    default:
      return (
        <svg className={`${base} text-[var(--text-muted)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="4" />
        </svg>
      );
  }
}
