import { useState, useEffect, useRef } from "react";

interface ComponentContextMenuProps {
  x: number;
  y: number;
  componentId: string;
  componentName: string;
  currentHtml: string;
  currentCss: string;
  iteration: number;
  onIterate: (instruction: string) => void;
  onClose: () => void;
}

export function ComponentContextMenu({
  x, y, componentName, onIterate, onClose,
}: ComponentContextMenuProps) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (instruction.trim()) {
      onIterate(instruction.trim());
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} />

      {/* Menu */}
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-3 w-80"
        style={{ left: x, top: y }}
      >
        <p className="text-xs font-medium text-slate-500 mb-2">
          Iterate on: {componentName}
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g., make it darker, add more spacing..."
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!instruction.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Go
          </button>
        </form>
      </div>
    </>
  );
}
