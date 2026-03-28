import { useState } from "react";
import type { FileEntry } from "@avv/shared";

interface FileTreeProps {
  files: FileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ files, selectedPath, onSelect }: FileTreeProps) {
  if (files.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--text-muted)]">
        No files yet
      </div>
    );
  }

  return (
    <div className="py-1 text-xs font-mono">
      {files.map((entry) => (
        <FileNode
          key={entry.path}
          entry={entry}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function FileNode({
  entry,
  depth,
  selectedPath,
  onSelect,
}: {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = entry.path === selectedPath;

  if (entry.isDirectory) {
    return (
      <div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] transition-colors"
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => setExpanded(!expanded)}
        >
          <svg className={`w-3 h-3 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
            <path d="M6 4l4 4-4 4" />
          </svg>
          <span className="text-blue-400/60">{entry.name}</span>
        </div>
        {expanded && entry.children?.map((child) => (
          <FileNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors ${
        isSelected
          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          : "text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]"
      }`}
      style={{ paddingLeft: depth * 16 + 24 }}
      onClick={() => onSelect(entry.path)}
    >
      <FileIcon name={entry.name} />
      <span className="truncate">{entry.name}</span>
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  let color = "text-[var(--text-muted)]";

  switch (ext) {
    case "ts":
    case "tsx":
      color = "text-blue-400/70";
      break;
    case "js":
    case "jsx":
      color = "text-yellow-400/70";
      break;
    case "css":
      color = "text-purple-400/70";
      break;
    case "html":
      color = "text-orange-400/70";
      break;
    case "json":
      color = "text-emerald-400/70";
      break;
    case "md":
      color = "text-[var(--text-muted)]";
      break;
  }

  return <span className={`${color} text-[9px]`}>{"\u25CF"}</span>;
}
