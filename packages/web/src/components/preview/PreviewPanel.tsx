import { useState } from "react";
import type { FileEntry } from "@avv/shared";
import { FileTree } from "./FileTree";
import { CodeViewer } from "./CodeViewer";
import { LivePreview } from "./LivePreview";

type Tab = "preview" | "files";

interface PreviewPanelProps {
  files: FileEntry[];
  fileContents: Map<string, string>;
  previewUrl: string | null;
}

export function PreviewPanel({ files, fileContents, previewUrl }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const selectedContent = selectedFile ? fileContents.get(selectedFile) : null;

  return (
    <aside className="w-[480px] min-w-[320px] border-l border-neutral-800 flex flex-col bg-neutral-950">
      {/* Tabs */}
      <div className="border-b border-neutral-800 flex">
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
        <LivePreview files={fileContents} previewUrl={previewUrl} />
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* File tree */}
          <div className="border-b border-neutral-800 max-h-[40%] overflow-y-auto">
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
              <p className="text-xs text-neutral-600">
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
      className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
        active
          ? "text-neutral-200 border-b-2 border-neutral-400"
          : "text-neutral-600 hover:text-neutral-400"
      }`}
    >
      {label}
      {badge != null && (
        <span className="bg-neutral-700 text-neutral-300 text-[10px] px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}
