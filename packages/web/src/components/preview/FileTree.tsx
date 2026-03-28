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
      <div className="p-4 text-xs text-neutral-600">
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
          className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-neutral-800/50 text-neutral-400"
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-[10px]">{expanded ? "\u25BE" : "\u25B8"}</span>
          <span className="text-blue-400/70">{entry.name}/</span>
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
      className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer transition-colors ${
        isSelected
          ? "bg-neutral-800 text-neutral-100"
          : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300"
      }`}
      style={{ paddingLeft: depth * 16 + 20 }}
      onClick={() => onSelect(entry.path)}
    >
      <FileIcon name={entry.name} />
      <span className="truncate">{entry.name}</span>
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  let color = "text-neutral-600";

  switch (ext) {
    case "ts":
    case "tsx":
      color = "text-blue-400";
      break;
    case "js":
    case "jsx":
      color = "text-yellow-400";
      break;
    case "css":
      color = "text-purple-400";
      break;
    case "html":
      color = "text-orange-400";
      break;
    case "json":
      color = "text-green-400";
      break;
    case "md":
      color = "text-neutral-400";
      break;
  }

  return <span className={`${color} text-[10px]`}>{"\u25A0"}</span>;
}
