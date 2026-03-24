import { useEffect, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import type { PageSection } from "@avv/shared";
import { AVV_PAGE_TYPE, type AVVPageProps, parseSections } from "../canvas/shapes";

interface PageLayer {
  shapeId: TLShapeId;
  title: string;
  status: string;
  sections: PageSection[];
}

interface LayersPanelProps {
  editor: Editor | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function LayersPanel({ editor, isOpen, onToggle }: LayersPanelProps) {
  const [pages, setPages] = useState<PageLayer[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<TLShapeId | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;

    const updateLayers = () => {
      const shapes = editor.getCurrentPageShapes();
      const pageLayers = shapes
        .filter((s) => s.type === AVV_PAGE_TYPE)
        .map((s) => {
          const props = s.props as AVVPageProps;
          return {
            shapeId: s.id,
            title: props.title,
            status: props.status,
            sections: parseSections(props.sectionsJson).sort((a, b) => a.order - b.order),
          };
        });
      setPages(pageLayers);
    };

    const updateSelection = () => {
      const selected = editor.getSelectedShapes();
      const avvSelected = selected.find((s) => s.type === AVV_PAGE_TYPE);
      setSelectedShapeId(avvSelected?.id ?? null);
    };

    const unsub = editor.store.listen(updateLayers, { scope: "document" });
    editor.on("change", updateSelection);

    updateLayers();
    updateSelection();

    return () => {
      unsub();
      editor.off("change", updateSelection);
    };
  }, [editor]);

  const handleSelectPage = (id: TLShapeId) => {
    if (!editor) return;
    setSelectedSectionId(null);
    editor.select(id);
    editor.zoomToSelection({ animation: { duration: 300 } });
  };

  const handleSelectSection = (shapeId: TLShapeId, sectionId: string) => {
    if (!editor) return;
    setSelectedSectionId(sectionId);
    editor.select(shapeId);
  };

  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-slate-300",
    generating: "bg-blue-500",
    ready: "bg-green-500",
    error: "bg-red-500",
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-2 top-2 z-40 px-2 py-1 bg-white rounded-md shadow border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
      >
        Layers
      </button>
    );
  }

  return (
    <div className="absolute left-0 top-0 bottom-0 w-56 bg-white border-r border-slate-200 z-40 flex flex-col shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-600">Layers</span>
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 text-sm">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {pages.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">No pages yet</p>
        ) : (
          pages.map((page) => (
            <div key={page.shapeId}>
              {/* Page row */}
              <button
                onClick={() => handleSelectPage(page.shapeId)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors font-semibold ${
                  selectedShapeId === page.shapeId && !selectedSectionId ? "bg-blue-50 text-blue-700" : "text-slate-600"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[page.status] || "bg-slate-300"}`} />
                <span className="truncate">{page.title}</span>
              </button>

              {/* Section rows (indented children) */}
              {page.sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSelectSection(page.shapeId, section.id)}
                  className={`w-full flex items-center gap-2 pl-7 pr-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors ${
                    selectedSectionId === section.id ? "bg-blue-50 text-blue-700" : "text-slate-500"
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[section.status] || "bg-slate-300"}`} />
                  <span className="truncate">{section.name}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
