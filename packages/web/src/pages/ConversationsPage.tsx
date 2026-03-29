import { useNavigate } from "react-router-dom";
import type { ConversationSummary } from "@avv/shared";

interface ConversationsPageProps {
  conversations: ConversationSummary[];
  isConnected: boolean;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenSettings: () => void;
}

export function ConversationsPage({
  conversations,
  isConnected,
  onNew,
  onDelete,
  onRename,
  onOpenSettings,
}: ConversationsPageProps) {
  const navigate = useNavigate();

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-subtle)] px-6 py-3.5 flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-wide text-[var(--text-secondary)]">AVV</h1>
        <div className="flex items-center gap-1.5">
          {!isConnected && (
            <span className="text-[11px] text-[var(--status-warning)]/60 mr-2" role="status">Connecting...</span>
          )}
          <button
            onClick={onOpenSettings}
            className="text-xs px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Settings
          </button>
          <button
            onClick={onNew}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors"
          >
            New chat
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto py-12 px-4">
          {conversations.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <div className="text-5xl opacity-10 select-none">{"\u2726"}</div>
              <p className="text-sm text-[var(--text-tertiary)]">No conversations yet</p>
              <button
                onClick={onNew}
                className="text-sm px-5 py-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors"
              >
                Start building
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  onClick={() => navigate(`/chat/${c.id}`)}
                  onDelete={() => onDelete(c.id)}
                  onRename={(title) => onRename(c.id, title)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ConversationRow({
  conversation,
  onClick,
  onDelete,
  onRename,
}: {
  conversation: ConversationSummary;
  onClick: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  return (
    <div
      className="group flex items-center px-4 py-3 rounded-xl cursor-pointer text-sm transition-colors hover:bg-[var(--bg-secondary)]"
      onClick={onClick}
    >
      <span className="flex-1 truncate text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
        {conversation.title}
      </span>
      <span className="text-[11px] text-[var(--text-muted)] mr-3">
        {formatDate(conversation.updatedAt)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          const newTitle = prompt("Rename conversation:", conversation.title);
          if (newTitle?.trim()) onRename(newTitle.trim());
        }}
        aria-label="Rename conversation"
        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs px-1.5 transition-opacity"
      >
        edit
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete conversation"
        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--status-error)] text-xs px-1.5 transition-opacity"
      >
        {"\u00D7"}
      </button>
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
