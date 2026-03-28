import { useState } from "react";
import type { ToolCall } from "@avv/shared";

interface ToolCallStepProps {
  toolCall: ToolCall;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-neutral-500",
  running: "text-blue-400",
  completed: "text-green-400",
  error: "text-red-400",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "\u25CB",
  running: "\u25CF",
  completed: "\u2713",
  error: "\u2717",
};

export function ToolCallStep({ toolCall }: ToolCallStepProps) {
  const [expanded, setExpanded] = useState(false);

  const color = STATUS_COLORS[toolCall.status] ?? "text-neutral-500";
  const icon = STATUS_ICONS[toolCall.status] ?? "\u25CB";

  return (
    <div
      className="my-1 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={`${color} font-mono`}>{icon}</span>
        <span className="text-neutral-400 font-mono">{toolCall.tool || "tool"}</span>
        {toolCall.status === "running" && (
          <span className="text-blue-400/60 animate-pulse">running...</span>
        )}
      </div>
      {expanded && (
        <div className="ml-5 mt-1 space-y-1">
          {Object.keys(toolCall.args).length > 0 && (
            <pre className="text-xs text-neutral-600 whitespace-pre-wrap font-mono">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          )}
          {toolCall.result && (
            <pre className="text-xs text-neutral-500 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
              {toolCall.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
