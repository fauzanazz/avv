import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "tldraw";
import { exportAsHtml, exportAsPng, exportAsSvg, copyHtmlToClipboard } from "../../utils/export";

interface TopBarProps {
  editor: Editor | null;
  isConnected: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}

export function TopBar({ editor, isConnected, leftOpen, rightOpen, onToggleLeft, onToggleRight }: TopBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  return (
    <header className="h-14 bg-white/80 backdrop-blur-xl flex justify-between items-center px-6 z-50 shrink-0">
      <div className="flex items-center gap-6">
        <span className="text-xl font-black text-stone-900 font-[Noto_Serif] italic">AVV</span>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest">
            {isConnected ? "Connected" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Export dropdown */}
        <div ref={exportRef} className="relative">
          <button onClick={() => setExportOpen(!exportOpen)} className="p-2 rounded text-stone-400 hover:text-stone-700 transition-colors" title="Export">
            <span className="material-symbols-outlined text-lg">download</span>
          </button>
          {exportOpen && editor && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-xl border border-stone-200 py-1 z-50">
              <button onClick={() => { const ok = exportAsHtml(editor); setExportOpen(false); showToast(ok ? "HTML downloaded" : "No page to export"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">code</span>
                <div><p className="text-xs font-semibold text-stone-700">Download HTML</p><p className="text-[10px] text-stone-400">Standalone .html file</p></div>
              </button>
              <button onClick={async () => { const ok = await exportAsPng(editor); setExportOpen(false); showToast(ok ? "PNG downloaded" : "PNG export failed"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">image</span>
                <div><p className="text-xs font-semibold text-stone-700">Download PNG</p><p className="text-[10px] text-stone-400">2x screenshot</p></div>
              </button>
              <div className="border-t border-stone-100 my-1" />
              <button onClick={async () => { const ok = await copyHtmlToClipboard(editor); setExportOpen(false); showToast(ok ? "HTML copied" : "Copy failed"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">content_copy</span>
                <div><p className="text-xs font-semibold text-stone-700">Copy HTML</p><p className="text-[10px] text-stone-400">Raw HTML to clipboard</p></div>
              </button>
              <button onClick={async () => { const ok = await exportAsSvg(editor); setExportOpen(false); showToast(ok ? "SVG copied — paste in Figma" : "SVG failed"); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                <span className="material-symbols-outlined text-sm text-stone-400">design_services</span>
                <div><p className="text-xs font-semibold text-stone-700">Copy SVG for Figma</p><p className="text-[10px] text-stone-400">Paste directly into Figma</p></div>
              </button>
            </div>
          )}
        </div>

        <button onClick={onToggleLeft} className={`p-2 rounded transition-colors ${leftOpen ? "text-blue-700" : "text-stone-400 hover:text-stone-700"}`}>
          <span className="material-symbols-outlined text-lg">layers</span>
        </button>
        <button onClick={onToggleRight} className={`p-2 rounded transition-colors ${rightOpen ? "text-blue-700" : "text-stone-400 hover:text-stone-700"}`}>
          <span className="material-symbols-outlined text-lg">auto_awesome</span>
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white px-4 py-2 rounded-lg text-xs font-[Public_Sans] z-[100] shadow-lg">
          {toast}
        </div>
      )}
    </header>
  );
}
