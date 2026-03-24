import { useEffect, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { AVV_COMPONENT_TYPE, type AVVComponentProps } from "../canvas/shapes";

interface LayerItem {
  id: TLShapeId;
  name: string;
  status: string;
}

interface LayersPanelProps {
  editor: Editor | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function LayersPanel({ editor, isOpen, onToggle }: LayersPanelProps) {
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedId, setSelectedId] = useState<TLShapeId | null>(null);

  useEffect(() => {
    if (!editor) return;

    const updateLayers = () => {
      const shapes = editor.getCurrentPageShapes();
      const avvLayers = shapes
        .filter((s) => s.type === AVV_COMPONENT_TYPE)
        .map((s) => ({
          id: s.id,
          name: (s.props as AVVComponentProps).name,
          status: (s.props as AVVComponentProps).status,
        }));
      setLayers(avvLayers);
    };

    const updateSelection = () => {
      const selected = editor.getSelectedShapes();
      const avvSelected = selected.find((s) => s.type === AVV_COMPONENT_TYPE);
      setSelectedId(avvSelected?.id ?? null);
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

  const handleSelectLayer = (id: TLShapeId) => {
    if (!editor) return;
    editor.select(id);
    editor.zoomToSelection({ animation: { duration: 300 } });
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
        {layers.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">No components yet</p>
        ) : (
          layers.map((layer) => (
            <button
              key={layer.id}
              onClick={() => handleSelectLayer(layer.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors ${
                selectedId === layer.id ? "bg-blue-50 text-blue-700" : "text-slate-600"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[layer.status] || "bg-slate-300"}`} />
              <span className="truncate">{layer.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
