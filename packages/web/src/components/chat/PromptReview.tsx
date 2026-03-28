import { useState } from "react";

interface PromptReviewProps {
  promptId: string;
  content: string;
  agentsOutput: Record<string, string>;
  onEdit: (promptId: string, content: string) => void;
  onApprove: (promptId: string) => void;
}

const AGENT_LABELS: Record<string, string> = {
  "design-engineer": "Design Engineer",
  "ux-engineer": "UX Engineer",
  "animation-engineer": "Animation Engineer",
  "artist-engineer": "Artist Engineer",
  "typewriter": "Typewriter",
};

const AGENT_COLORS: Record<string, string> = {
  "design-engineer": "text-purple-400",
  "ux-engineer": "text-blue-400",
  "animation-engineer": "text-cyan-400",
  "artist-engineer": "text-pink-400",
  "typewriter": "text-green-400",
};

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
    <div className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-900/50">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-300">Comprehensive Prompt</span>
          <span className="text-[10px] text-neutral-600">
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
              className="text-[10px] px-2 py-1 rounded bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"
            >
              Save edits
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-[10px] px-2 py-1 rounded text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onApprove(promptId)}
            className="text-[10px] px-3 py-1 rounded bg-green-800/50 text-green-300 hover:bg-green-800/80 font-medium transition-colors"
          >
            Approve &amp; Generate
          </button>
        </div>
      </div>

      {/* Agent contributions */}
      {agents.length > 0 && (
        <div className="border-b border-neutral-800">
          {agents.map(([agent, output]) => (
            <div key={agent} className="border-b border-neutral-800/50 last:border-b-0">
              <button
                onClick={() => toggleAgent(agent)}
                className="w-full px-4 py-1.5 flex items-center gap-2 text-xs hover:bg-neutral-800/30 transition-colors"
              >
                <span className="text-[10px]">
                  {expandedAgents.has(agent) ? "\u25BE" : "\u25B8"}
                </span>
                <span className={AGENT_COLORS[agent] ?? "text-neutral-400"}>
                  {AGENT_LABELS[agent] ?? agent}
                </span>
                <span className="text-neutral-700 ml-auto">
                  {output.length} chars
                </span>
              </button>
              {expandedAgents.has(agent) && (
                <pre className="px-4 pb-2 text-[11px] text-neutral-500 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
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
            className="w-full h-64 bg-neutral-950 border border-neutral-700 rounded p-3 text-xs text-neutral-300 font-mono resize-y focus:outline-none focus:border-neutral-500"
          />
        ) : (
          <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
