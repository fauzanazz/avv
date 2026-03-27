import { useState, useCallback } from "react";
import type { Screen, DesignSystem, ComponentStatus, ClientMessage } from "@avv/shared";

interface ScreenTabsProps {
  screens: Screen[];
  activeScreenId: string | null;
  designSystem: DesignSystem | null;
  onSelectScreen: (id: string) => void;
  onSend: (msg: ClientMessage) => void;
}

const statusDot: Record<ComponentStatus, string> = {
  ready: "bg-green-500",
  generating: "bg-blue-500 animate-pulse",
  error: "bg-red-500",
  pending: "bg-stone-300",
};

export function ScreenTabs({ screens, activeScreenId, designSystem, onSelectScreen, onSend }: ScreenTabsProps) {
  const [showAddScreen, setShowAddScreen] = useState(false);
  const [newScreenPrompt, setNewScreenPrompt] = useState("");

  const handleAddScreen = useCallback(() => {
    if (!newScreenPrompt.trim()) return;
    onSend({ type: "add:screen", prompt: newScreenPrompt.trim() });
    setNewScreenPrompt("");
    setShowAddScreen(false);
  }, [newScreenPrompt, onSend]);

  const handleRegenerateLayouts = useCallback((screenId: string) => {
    onSend({ type: "regenerate:layouts", screenId });
  }, [onSend]);

  return (
    <aside className="w-52 bg-stone-50 flex flex-col border-x border-stone-100 shrink-0">
      {/* Design system indicator */}
      {designSystem && (
        <div className="p-3 border-b border-stone-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-xs text-amber-600">palette</span>
            <span className="text-[10px] font-[Public_Sans] font-bold text-stone-500 uppercase tracking-widest">
              Design System
            </span>
          </div>
          <p className="text-xs font-[Public_Sans] font-semibold text-stone-700 truncate">
            {designSystem.label}
          </p>
          <div className="flex gap-0.5 mt-1.5">
            {Object.values(designSystem.tokens.colors).slice(0, 6).map((color, i) => (
              <div
                key={i}
                className="h-3 flex-1 first:rounded-l last:rounded-r"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Screens header */}
      <div className="p-3 border-b border-stone-100 flex items-center justify-between">
        <span className="text-[10px] font-[Public_Sans] font-bold text-stone-500 uppercase tracking-widest">
          Screens
        </span>
        {designSystem && (
          <button
            onClick={() => setShowAddScreen(!showAddScreen)}
            className="p-0.5 rounded text-stone-400 hover:text-amber-700 transition-colors"
            title="Add screen"
          >
            <span className="material-symbols-outlined text-sm">add</span>
          </button>
        )}
      </div>

      {/* Add screen form */}
      {showAddScreen && (
        <div className="p-2 border-b border-stone-100 bg-white">
          <input
            type="text"
            value={newScreenPrompt}
            onChange={(e) => setNewScreenPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddScreen()}
            placeholder="Describe the new screen..."
            className="w-full text-[11px] font-[Public_Sans] px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:border-amber-400"
            autoFocus
          />
          <div className="flex gap-1 mt-1.5">
            <button
              onClick={handleAddScreen}
              disabled={!newScreenPrompt.trim()}
              className="flex-1 text-[10px] font-[Public_Sans] font-semibold px-2 py-1 bg-amber-700 text-white rounded disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddScreen(false)}
              className="text-[10px] font-[Public_Sans] px-2 py-1 text-stone-400 hover:text-stone-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-2">
        {screens.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[11px] text-stone-300 italic font-[Noto_Serif]">
              No screens yet
            </p>
          </div>
        ) : (
          screens.map((screen) => (
            <div key={screen.id} className="px-2 group">
              <button
                onClick={() => onSelectScreen(screen.id)}
                className={`flex items-center gap-2 p-2 w-full rounded-lg text-left transition-colors ${
                  activeScreenId === screen.id
                    ? "bg-white shadow-sm border border-stone-200"
                    : "hover:bg-stone-100"
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot[screen.status]}`} />
                <span className="text-[12px] font-[Public_Sans] text-stone-700 truncate flex-1">
                  {screen.name}
                </span>
                <span className="text-[9px] font-[Public_Sans] text-stone-400">
                  {screen.components.length}
                </span>
              </button>
              {activeScreenId === screen.id && screen.status === "ready" && (
                <button
                  onClick={() => handleRegenerateLayouts(screen.id)}
                  className="ml-6 mt-1 text-[9px] font-[Public_Sans] text-stone-400 hover:text-amber-700 uppercase tracking-widest"
                >
                  Regenerate layouts
                </button>
              )}
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
