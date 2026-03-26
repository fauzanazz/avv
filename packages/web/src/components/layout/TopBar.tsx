export type Viewport = "mobile" | "tablet" | "desktop";

interface TopBarProps {
  isConnected: boolean;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
}

const viewportOptions: { key: Viewport; label: string; width: number }[] = [
  { key: "mobile", label: "M", width: 375 },
  { key: "tablet", label: "T", width: 768 },
  { key: "desktop", label: "D", width: 1280 },
];

export function TopBar({ isConnected, viewport, onViewportChange }: TopBarProps) {
  return (
    <header className="h-12 bg-white/80 backdrop-blur-xl flex justify-between items-center px-6 z-50 shrink-0 border-b border-stone-100">
      <div className="flex items-center gap-6">
        <span className="text-xl font-black text-stone-900 font-[Noto_Serif] italic">AVV</span>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest">
            {isConnected ? "Connected" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
        {viewportOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onViewportChange(opt.key)}
            className={`px-3 py-1 rounded text-[10px] font-[Public_Sans] font-bold uppercase tracking-wider transition-colors ${
              viewport === opt.key
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-400 hover:text-stone-600"
            }`}
            title={`${opt.width}px`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </header>
  );
}
