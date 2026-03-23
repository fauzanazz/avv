import { useState } from "react";

interface PromptBarProps {
  onGenerate: (prompt: string, mode: "simple" | "ultrathink") => void;
  isConnected: boolean;
}

export function PromptBar({ onGenerate, isConnected }: PromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"simple" | "ultrathink">("simple");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onGenerate(prompt.trim(), mode);
    setPrompt("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 z-50"
    >
      <div
        className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
        title={isConnected ? "Connected" : "Disconnected"}
      />

      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the UI you want to build..."
        className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />

      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as "simple" | "ultrathink")}
        className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
      >
        <option value="simple">Simple</option>
        <option value="ultrathink">UltraThink</option>
      </select>

      <button
        type="submit"
        disabled={!prompt.trim() || !isConnected}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Generate
      </button>
    </form>
  );
}
