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
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-wide text-neutral-200">AVV</h1>
        <div className="flex items-center gap-2">
          {!isConnected && (
            <span className="text-xs text-amber-500/70">Connecting...</span>
          )}
          <button
            onClick={onOpenSettings}
            className="text-xs px-3 py-1.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Settings
          </button>
          <button
            onClick={onNew}
            className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          >
            + New
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-8 px-4">
          {conversations.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="text-4xl text-neutral-700">{"\u25C8"}</div>
              <p className="text-sm text-neutral-500">No conversations yet</p>
              <button
                onClick={onNew}
                className="text-xs px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              >
                Start a conversation
              </button>
            </div>
          ) : (
            <div className="space-y-1">
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
      className="group flex items-center px-4 py-3 rounded-lg cursor-pointer text-sm transition-colors hover:bg-neutral-900"
      onClick={onClick}
    >
      <span className="flex-1 truncate text-neutral-300">{conversation.title}</span>
      <span className="text-[10px] text-neutral-600 mr-3">
        {new Date(conversation.updatedAt).toLocaleDateString()}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          const newTitle = prompt("Rename conversation:", conversation.title);
          if (newTitle?.trim()) onRename(newTitle.trim());
        }}
        className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-300 text-xs px-1 transition-opacity"
      >
        edit
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 text-xs px-1 transition-opacity"
      >
        {"\u00D7"}
      </button>
    </div>
  );
}
