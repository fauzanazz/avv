import { useState } from "react";
import { AGENT_LABELS, AGENT_COLORS } from "./agent-constants";

interface PromptReviewProps {
  promptId: string;
  content: string;
  agentsOutput: Record<string, string>;
  onEdit: (promptId: string, content: string) => void;
  onApprove: (promptId: string) => void;
}

export function PromptReview({
  promptId,
  content,
  agentsOutput,
  onEdit,
  onApprove,
}: PromptReviewProps) {
  const [editedContent, setEditedContent] = useState(content);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (agent: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) next.delete(agent);
      else next.add(agent);
      return next;
    });
  };

  const agents = Object.entries(agentsOutput).filter(([, output]) => output.trim());

  return (
    <div className="border border-[var(--border-default)] rounded-lg overflow-hidden bg-[var(--bg-secondary)]">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Comprehensive Prompt</span>
          <span className="text-[10px] text-[var(--text-muted)]">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} contributed
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <button
              onClick={() => {
                onEdit(promptId, editedContent);
                setIsEditing(false);
              }}
              className="text-[10px] px-2 py-1 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              Save edits
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-[10px] px-2 py-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onApprove(promptId)}
            className="text-[10px] px-3 py-1 rounded bg-[var(--status-success)]/20 text-[var(--status-success)] hover:bg-[var(--status-success)]/30 font-medium transition-colors"
          >
            Approve &amp; Generate
          </button>
        </div>
      </div>

      {/* Agent contributions */}
      {agents.length > 0 && (
        <div className="border-b border-[var(--border-subtle)]">
          {agents.map(([agent, output]) => (
            <div key={agent} className="border-b border-[var(--border-subtle)]/50 last:border-b-0">
              <button
                onClick={() => toggleAgent(agent)}
                aria-expanded={expandedAgents.has(agent)}
                aria-label={`Toggle ${AGENT_LABELS[agent] ?? agent} details`}
                className="w-full px-4 py-1.5 flex items-center gap-2 text-xs hover:bg-[var(--bg-elevated)]/30 transition-colors"
              >
                <span className="text-[10px]" aria-hidden="true">
                  {expandedAgents.has(agent) ? "\u25BE" : "\u25B8"}
                </span>
                <span className={AGENT_COLORS[agent] ?? "text-[var(--text-tertiary)]"}>
                  {AGENT_LABELS[agent] ?? agent}
                </span>
                <span className="text-[var(--text-muted)] ml-auto">
                  {output.length} chars
                </span>
              </button>
              {expandedAgents.has(agent) && (
                <pre className="px-4 pb-2 text-[11px] text-[var(--text-tertiary)] whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                  {output}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Prompt content */}
      <div className="p-4">
        {isEditing ? (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            aria-label="Edit prompt content"
            className="w-full h-64 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded p-3 text-xs text-[var(--text-secondary)] font-mono resize-y focus:outline-none focus:border-[var(--accent-secondary)] focus:ring-1 focus:ring-[var(--accent-secondary)]"
          />
        ) : (
          <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
