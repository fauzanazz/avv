import { useState } from "react";
import type { ConversationSummary } from "@avv/shared";

interface SidebarProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="w-64 min-w-64 border-r border-neutral-800 flex flex-col bg-neutral-950">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-wide text-neutral-200">AVV</h1>
        <button
          onClick={onNew}
          className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
        >
          + New
        </button>
      </div>

      {/* Conversation list */}
      <nav className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-neutral-600 px-4 py-2">No conversations yet</p>
        ) : (
          conversations.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              isActive={c.id === activeId}
              onSelect={() => onSelect(c.id)}
              onDelete={() => onDelete(c.id)}
              onRename={(title) => onRename(c.id, title)}
            />
          ))
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-neutral-800 p-2">
        <button
          onClick={onOpenSettings}
          className="w-full text-left px-3 py-2 rounded-md text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300 transition-colors"
        >
          Settings
        </button>
      </div>
    </aside>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`group flex items-center px-3 py-2 mx-2 rounded-md cursor-pointer text-sm transition-colors ${
        isActive
          ? "bg-neutral-800 text-neutral-100"
          : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
      }`}
      onClick={() => !isEditing && onSelect()}
      onDoubleClick={() => {
        setEditTitle(conversation.title);
        setIsEditing(true);
      }}
    >
      {isEditing ? (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="flex-1 bg-transparent border-b border-neutral-600 text-xs text-neutral-100 focus:outline-none"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{conversation.title}</span>
      )}
      {!isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 ml-2 text-xs transition-opacity"
        >
          &times;
        </button>
      )}
    </div>
  );
}
