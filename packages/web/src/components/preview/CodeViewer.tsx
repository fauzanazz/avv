interface CodeViewerProps {
  content: string;
  filename: string;
}

export function CodeViewer({ content, filename }: CodeViewerProps) {
  const lines = content.split("\n");
  const gutterWidth = String(lines.length).length;

  return (
    <div className="flex-1 overflow-auto bg-neutral-950">
      {/* File header */}
      <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800 px-4 py-1.5 flex items-center gap-2">
        <span className="text-xs text-neutral-400 font-mono truncate">{filename}</span>
        <CopyButton content={content} />
      </div>

      {/* Code */}
      <pre className="text-xs font-mono leading-5 p-0">
        {lines.map((line, i) => (
          <div
            key={i}
            className="flex hover:bg-neutral-900/50"
          >
            <span
              className="select-none text-neutral-700 text-right pr-4 pl-4 shrink-0"
              style={{ minWidth: gutterWidth * 8 + 32 }}
            >
              {i + 1}
            </span>
            <code className="text-neutral-300 whitespace-pre pr-4 flex-1">
              {line || " "}
            </code>
          </div>
        ))}
      </pre>
    </div>
  );
}

function CopyButton({ content }: { content: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors ml-auto"
    >
      Copy
    </button>
  );
}
