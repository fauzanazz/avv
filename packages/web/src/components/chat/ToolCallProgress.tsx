import { useState } from "react";
import type { ToolCall } from "@avv/shared";

interface ToolCallProgressProps {
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

function extractFilePath(toolCall: ToolCall): string | null {
  const args = toolCall.args;
  if (typeof args.file_path === "string" && args.file_path) return args.file_path;
  if (typeof args.path === "string" && args.path) return args.path;
  if (typeof args.command === "string" && args.command) {
    // Trim long commands
    const cmd = args.command as string;
    return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
  }
  if (typeof args.description === "string" && args.description) return args.description as string;
  return null;
}

function getToolIcon(tool: string) {
  const base = "w-3 h-3 flex-shrink-0";
  switch (tool.toLowerCase()) {
    case "write":
    case "writefile":
      return (
        <svg className={`${base} text-[var(--accent-primary)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l2 2-8 8H4v-2L12 2z" />
          <path d="M2 14h12" />
        </svg>
      );
    case "read":
    case "readfile":
      return (
        <svg className={`${base} text-[var(--text-muted)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="2" width="10" height="12" rx="1" />
          <path d="M6 6h4M6 9h4M6 12h2" />
        </svg>
      );
    case "edit":
    case "strreplacebasededitortool":
      return (
        <svg className={`${base} text-[var(--accent-secondary)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12l1.5-1.5 2 2L14 4" />
        </svg>
      );
    case "bash":
    case "run_command":
    case "execute":
      return (
        <svg className={`${base} text-[var(--text-secondary)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4l4 4-4 4" />
          <path d="M9 12h4" />
        </svg>
      );
    default:
      return (
        <svg className={`${base} text-[var(--text-muted)]`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="8" cy="8" r="4" />
        </svg>
      );
  }
}

function isWriteTool(tool: string): boolean {
  return ["write", "writefile", "write_file"].includes(tool.toLowerCase());
}

function isBashTool(tool: string): boolean {
  return ["bash", "run_command", "execute", "shell"].includes(tool.toLowerCase());
}

function getToolLabel(tool: string): string {
  const t = tool.toLowerCase();
  if (isWriteTool(t)) return "Write";
  if (["read", "readfile", "read_file"].includes(t)) return "Read";
  if (["edit", "strreplacebasededitortool", "str_replace_editor"].includes(t)) return "Edit";
  if (isBashTool(t)) return "Bash";
  return tool;
}

export function ToolCallProgress({ toolCalls, isStreaming }: ToolCallProgressProps) {
  const [expanded, setExpanded] = useState(false);

  const writeCalls = toolCalls.filter((tc) => isWriteTool(tc.tool));
  const completedWriteCalls = writeCalls.filter((tc) => tc.status === "completed");
  const hasWrites = writeCalls.length > 0;

  const completedCalls = toolCalls.filter((tc) => tc.status === "completed");
  const totalOps = hasWrites ? writeCalls.length : toolCalls.length;
  const completedOps = hasWrites ? completedWriteCalls.length : completedCalls.length;

  const progressPct = totalOps > 0 ? (completedOps / totalOps) * 100 : 0;

  // Most recent tool call for streaming label
  const lastTool = toolCalls[toolCalls.length - 1];
  const lastLabel = lastTool ? extractFilePath(lastTool) : null;

  // Action label for streaming bar
  let actionLabel = "Working...";
  if (lastTool) {
    const tool = lastTool.tool.toLowerCase();
    if (isWriteTool(tool)) actionLabel = "Creating files...";
    else if (["read", "readfile", "read_file"].includes(tool)) actionLabel = "Reading files...";
    else if (["edit", "strreplacebasededitortool", "str_replace_editor"].includes(tool)) actionLabel = "Editing files...";
    else if (isBashTool(tool)) actionLabel = "Running commands...";
    else actionLabel = "Processing...";
  }

  if (isStreaming) {
    return (
      <div className="rounded-lg bg-[var(--bg-secondary)] p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">{actionLabel}</span>
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {completedOps}/{totalOps}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={completedOps}
            aria-valuemin={0}
            aria-valuemax={totalOps}
          />
        </div>

        {/* Current file/command */}
        {lastLabel && (
          <div className="text-[11px] text-[var(--text-muted)] font-mono truncate" title={lastLabel}>
            {lastLabel}
          </div>
        )}
      </div>
    );
  }

  // Completed mode — build summary
  const uniqueWritePaths = new Set(
    writeCalls
      .filter((tc) => tc.status === "completed")
      .map((tc) => extractFilePath(tc))
      .filter(Boolean)
  );
  const bashCalls = toolCalls.filter((tc) => isBashTool(tc.tool) && tc.status === "completed");

  let summaryText = "";
  if (uniqueWritePaths.size > 0) {
    summaryText = `${uniqueWritePaths.size} file${uniqueWritePaths.size !== 1 ? "s" : ""} created`;
  } else if (completedCalls.length > 0) {
    summaryText = `${completedCalls.length} operation${completedCalls.length !== 1 ? "s" : ""} completed`;
  } else {
    summaryText = `${toolCalls.length} step${toolCalls.length !== 1 ? "s" : ""}`;
  }
  if (bashCalls.length > 0 && uniqueWritePaths.size > 0) {
    summaryText += `, ${bashCalls.length} command${bashCalls.length !== 1 ? "s" : ""} run`;
  }

  // Group tool calls for expanded view
  const groups = new Map<string, ToolCall[]>();
  for (const tc of toolCalls) {
    const label = getToolLabel(tc.tool);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(tc);
  }

  return (
    <div className="rounded-lg bg-[var(--bg-secondary)] overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-elevated)] transition-colors"
        aria-expanded={expanded}
      >
        {/* Green checkmark */}
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--status-success)]"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 8.5l3 3 7-7" />
        </svg>
        <span className="flex-1 text-xs text-[var(--text-secondary)]">{summaryText}</span>
        {/* Chevron */}
        <svg
          className={`w-3 h-3 flex-shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>

      {/* Expanded grouped list */}
      {expanded && (
        <div className="border-t border-[var(--border-default)] max-h-60 overflow-y-auto">
          {Array.from(groups.entries()).map(([label, calls]) => (
            <div key={label} className="px-3 py-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                {label}
              </div>
              {calls.map((tc) => {
                const filePath = extractFilePath(tc);
                return (
                  <div key={tc.id} className="flex items-center gap-2 pl-1">
                    {getToolIcon(tc.tool)}
                    <span className="text-[11px] text-[var(--text-tertiary)] font-mono truncate" title={filePath ?? tc.tool}>
                      {filePath ?? tc.tool}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
