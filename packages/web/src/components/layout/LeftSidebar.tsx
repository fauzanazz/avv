import { useEffect, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { AVV_PAGE_TYPE, parseSections, type AVVPageProps } from "../../canvas/shapes";
import type { PageSection } from "@avv/shared";

interface LeftSidebarProps {
  editor: Editor | null;
  onClose: () => void;
  onRetry: (pageId: string, sectionId: string) => void;
}

interface PageLayer { shapeId: TLShapeId; title: string; status: string; sections: PageSection[]; }

export function LeftSidebar({ editor, onClose, onRetry }: LeftSidebarProps) {
  const [pages, setPages] = useState<PageLayer[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const pageShapes = editor.getCurrentPageShapes()
        .filter((s) => s.type === AVV_PAGE_TYPE)
        .map((s) => ({
          shapeId: s.id,
          title: (s.props as AVVPageProps).title,
          status: (s.props as AVVPageProps).status,
          sections: parseSections((s.props as AVVPageProps).sectionsJson),
        }));
      setPages(pageShapes);
    };
    const unsub = editor.store.listen(update, { scope: "document" });
    update();
    return () => unsub();
  }, [editor]);

  const statusIcon = (s: string) => s === "ready" ? "check_circle" : s === "generating" ? "pending" : s === "error" ? "error" : "radio_button_unchecked";
  const statusColor = (s: string) => s === "ready" ? "text-green-600" : s === "generating" ? "text-blue-500 animate-pulse" : s === "error" ? "text-red-500" : "text-stone-300";

  return (
    <aside className="w-60 bg-stone-50 flex flex-col border-r border-stone-100 shrink-0 z-40">
      <div className="p-4 border-b border-stone-100">
        <h2 className="text-stone-900 font-[Noto_Serif] text-sm font-bold">Project</h2>
        <p className="text-[10px] text-stone-400 font-[Public_Sans] uppercase tracking-widest mt-1">Layers</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-4">
          <span className="text-[10px] font-[Public_Sans] font-bold text-stone-400 uppercase tracking-widest">Canvas Layers</span>
          {pages.length === 0 ? (
            <p className="mt-4 text-[11px] text-stone-300 italic font-[Noto_Serif]">No pages yet.</p>
          ) : pages.map((page) => (
            <div key={page.shapeId} className="mt-4 space-y-1">
              <button onClick={() => { editor?.select(page.shapeId); editor?.zoomToSelection({ animation: { duration: 300 } }); }}
                className="flex items-center gap-2 p-1.5 w-full rounded hover:bg-stone-100 cursor-pointer text-left">
                <span className={`material-symbols-outlined text-xs ${statusColor(page.status)}`}>{statusIcon(page.status)}</span>
                <span className="text-[11px] font-semibold text-stone-700 truncate">{page.title}</span>
              </button>
              {[...page.sections].sort((a, b) => a.order - b.order).map((section) => (
                <div key={section.id} className={`flex items-center gap-2 p-1.5 rounded hover:bg-stone-100 cursor-pointer pl-6 border-l transition-colors ${selectedSection === section.id ? "border-blue-500 bg-blue-50" : "border-stone-200"}`}>
                  <button onClick={() => setSelectedSection(section.id)} className="flex items-center gap-2 flex-1 text-left">
                    <span className={`material-symbols-outlined text-xs ${statusColor(section.status)}`}>{statusIcon(section.status)}</span>
                    <span className="text-[11px] text-stone-500 truncate">{section.name}</span>
                  </button>
                  {section.status === "error" && (
                    <button onClick={() => onRetry(page.shapeId, section.id)} className="text-red-400 hover:text-red-600" title="Retry">
                      <span className="material-symbols-outlined text-xs">refresh</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-stone-100">
        <button onClick={onClose} className="w-full text-stone-400 hover:text-stone-600 text-[10px] font-[Public_Sans] uppercase tracking-widest">Collapse</button>
      </div>
    </aside>
  );
}
