import type { GenerationSession, ComponentStatus } from "@avv/shared";

interface ComponentListProps {
  session: GenerationSession | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: (sessionId: string, componentId: string) => void;
}

const statusIcon: Record<ComponentStatus, string> = {
  ready: "check_circle",
  generating: "pending",
  error: "error",
  pending: "radio_button_unchecked",
};

const statusColor: Record<ComponentStatus, string> = {
  ready: "text-green-600",
  generating: "text-blue-500 animate-pulse",
  error: "text-red-500",
  pending: "text-stone-300",
};

export function ComponentList({ session, selectedId, onSelect, onRetry }: ComponentListProps) {
  if (!session) {
    return (
      <aside className="w-52 bg-stone-50 flex flex-col border-x border-stone-100 shrink-0">
        <div className="p-4 border-b border-stone-100">
          <h2 className="text-stone-900 font-[Noto_Serif] text-sm font-bold">Components</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-[11px] text-stone-300 italic font-[Noto_Serif] text-center">
            Generate a design to see components here.
          </p>
        </div>
      </aside>
    );
  }

  const sorted = [...session.components].sort((a, b) => a.order - b.order);

  return (
    <aside className="w-52 bg-stone-50 flex flex-col border-x border-stone-100 shrink-0">
      <div className="p-4 border-b border-stone-100">
        <h2 className="text-stone-900 font-[Noto_Serif] text-sm font-bold truncate">{session.title}</h2>
        <p className="text-[10px] text-stone-400 font-[Public_Sans] uppercase tracking-widest mt-1">
          {sorted.filter((c) => c.status === "ready").length}/{sorted.length} ready
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sorted.map((comp) => (
          <div key={comp.id} className="px-2">
            <button
              onClick={() => onSelect(comp.id)}
              className={`flex items-center gap-2 p-2 w-full rounded-lg text-left transition-colors ${
                selectedId === comp.id
                  ? "bg-white shadow-sm border border-stone-200"
                  : "hover:bg-stone-100"
              }`}
            >
              <span className={`material-symbols-outlined text-sm ${statusColor[comp.status]}`}>
                {statusIcon[comp.status]}
              </span>
              <span className="text-[12px] font-[Public_Sans] text-stone-700 truncate flex-1">
                {comp.name}
              </span>
              {comp.variants.length > 0 && (
                <span className="text-[9px] font-[Public_Sans] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">
                  {comp.variants.length}
                </span>
              )}
            </button>
            {comp.status === "error" && session && (
              <button
                onClick={() => onRetry(session.id, comp.id)}
                className="ml-8 text-[10px] font-[Public_Sans] text-red-400 hover:text-red-600 uppercase tracking-widest"
              >
                Retry
              </button>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
