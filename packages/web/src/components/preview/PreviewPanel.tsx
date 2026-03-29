import { useState } from "react";
import type { FileEntry } from "@avv/shared";
import type { SandboxProgressStep } from "../../hooks/useChat";
import { FileTree } from "./FileTree";
import { CodeViewer } from "./CodeViewer";
import { LivePreview } from "./LivePreview";

type Tab = "preview" | "files";

interface PreviewPanelProps {
  files: FileEntry[];
  fileContents: Map<string, string>;
  previewUrl: string | null;
  refreshTrigger?: number;
  sandboxProgress?: SandboxProgressStep[] | null;
}

export function PreviewPanel({ files, fileContents, previewUrl, refreshTrigger, sandboxProgress }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const selectedContent = selectedFile ? fileContents.get(selectedFile) : null;

  return (
    <aside className="w-full flex-1 border-l border-[var(--border-subtle)] flex flex-col bg-[var(--bg-primary)]">
      {/* Tabs */}
      <div className="border-b border-[var(--border-subtle)] flex px-2" role="tablist">
        <TabButton
          label="Preview"
          active={activeTab === "preview"}
          onClick={() => setActiveTab("preview")}
        />
        <TabButton
          label="Files"
          active={activeTab === "files"}
          onClick={() => setActiveTab("files")}
          badge={fileContents.size > 0 ? fileContents.size : undefined}
        />
      </div>

      {/* Content */}
      {activeTab === "preview" ? (
        <LivePreview files={fileContents} previewUrl={previewUrl} refreshTrigger={refreshTrigger} sandboxProgress={sandboxProgress} />
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* File tree */}
          <div className="border-b border-[var(--border-subtle)] max-h-[40%] overflow-y-auto">
            <FileTree
              files={files}
              selectedPath={selectedFile}
              onSelect={setSelectedFile}
            />
          </div>

          {/* Code viewer */}
          {selectedContent != null && selectedFile ? (
            <CodeViewer content={selectedContent} filename={selectedFile} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-[var(--text-muted)]">
                {files.length > 0
                  ? "Select a file to view"
                  : "No files generated yet"}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function TabButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`px-4 min-h-[44px] text-xs font-medium transition-colors flex items-center gap-1.5 relative ${
        active
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-tertiary)]"
      }`}
    >
      {label}
      {badge != null && (
        <span className="bg-[var(--bg-surface)] text-[var(--text-tertiary)] text-[10px] px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--text-secondary)] rounded-full" />
      )}
    </button>
  );
}
