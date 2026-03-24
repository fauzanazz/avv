# AVV Panels — Layers and Properties

## Context

With the canvas and components working (FAU-34), users need sidebar panels to navigate and inspect components — just like Figma's left (layers) and right (properties) panels.

## Requirements

- **Layers panel** (left side): Lists all `avv-component` shapes on the canvas with name, status, and click-to-select
- **Properties panel** (right side): Shows selected component's metadata — name, status, prompt, iteration count, and raw HTML/CSS
- Panels are collapsible
- Selection syncs: clicking a layer selects the shape on canvas and vice versa

## Implementation

### Layers panel

File: `packages/web/src/components/LayersPanel.tsx`

```typescript
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

  // Sync layers from editor
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

    // Listen for changes
    const unsub1 = editor.store.listen(updateLayers, { scope: "document" });
    const unsub2 = editor.on("change", updateSelection);

    updateLayers();
    updateSelection();

    return () => {
      unsub1();
      unsub2();
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
```

### Properties panel

File: `packages/web/src/components/PropertiesPanel.tsx`

```typescript
import { useEffect, useState } from "react";
import type { Editor } from "tldraw";
import { AVV_COMPONENT_TYPE, type AVVComponentProps } from "../canvas/shapes";

interface PropertiesPanelProps {
  editor: Editor | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function PropertiesPanel({ editor, isOpen, onToggle }: PropertiesPanelProps) {
  const [props, setProps] = useState<AVVComponentProps | null>(null);
  const [showHtml, setShowHtml] = useState(false);

  useEffect(() => {
    if (!editor) return;

    const updateProps = () => {
      const selected = editor.getSelectedShapes();
      const avvShape = selected.find((s) => s.type === AVV_COMPONENT_TYPE);
      setProps(avvShape ? (avvShape.props as AVVComponentProps) : null);
    };

    const unsub = editor.on("change", updateProps);
    updateProps();

    return () => { unsub(); };
  }, [editor]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-2 top-2 z-40 px-2 py-1 bg-white rounded-md shadow border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
      >
        Properties
      </button>
    );
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 bg-white border-l border-slate-200 z-40 flex flex-col shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-600">Properties</span>
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 text-sm">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!props ? (
          <p className="text-xs text-slate-400">Select a component to view properties</p>
        ) : (
          <div className="space-y-3">
            <PropRow label="Name" value={props.name} />
            <PropRow label="Status" value={props.status} />
            <PropRow label="Dimensions" value={`${props.w} x ${props.h}`} />
            <PropRow label="Agent" value={props.agentId || "—"} />
            <PropRow label="Iteration" value={String(props.iteration)} />

            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Prompt</p>
              <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 whitespace-pre-wrap">
                {props.prompt || "—"}
              </p>
            </div>

            <div>
              <button
                onClick={() => setShowHtml(!showHtml)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showHtml ? "Hide" : "Show"} HTML/CSS
              </button>

              {showHtml && (
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">HTML</p>
                    <pre className="text-xs text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                      {props.html || "—"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">CSS</p>
                    <pre className="text-xs text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                      {props.css || "—"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-700">{value}</span>
    </div>
  );
}
```

### Wire panels into App.tsx

Add to App.tsx:

```typescript
// State
const [layersOpen, setLayersOpen] = useState(true);
const [propsOpen, setPropsOpen] = useState(false);

// In the canvas area div, add:
<LayersPanel editor={editor} isOpen={layersOpen} onToggle={() => setLayersOpen(!layersOpen)} />
<PropertiesPanel editor={editor} isOpen={propsOpen} onToggle={() => setPropsOpen(!propsOpen)} />
```

### Update components barrel export

File: `packages/web/src/components/index.ts` (replace existing)

```typescript
export { PromptBar } from "./PromptBar";
export { StatusBar } from "./StatusBar";
export { ChatPanel } from "./ChatPanel";
export { LayersPanel } from "./LayersPanel";
export { PropertiesPanel } from "./PropertiesPanel";
export { ComponentContextMenu } from "./ComponentContextMenu";
```

## Testing Strategy

```bash
# 1. Generate some components
# 2. Layers panel (left): lists all components with status dots
# 3. Click a layer item: canvas selects and zooms to that component
# 4. Select a component on canvas: Properties panel (right) shows its data
# 5. Click "Show HTML/CSS" in properties: raw code appears
# 6. Collapse/expand panels via close/toggle buttons
```

## Out of Scope

- Drag-to-reorder layers
- Rename components from the panel
- Edit HTML/CSS directly in the properties panel
- Component grouping or nesting
