import { useState, useCallback } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { AVVComponentShapeUtil, AVV_COMPONENT_TYPE } from "./canvas/shapes";
import { LayersPanel } from "./components/LayersPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";

const customShapeUtils = [AVVComponentShapeUtil];

function handleMount(editor: Editor) {
  const existing = editor.getCurrentPageShapes().some((s) => s.type === AVV_COMPONENT_TYPE);
  if (existing) return;

  editor.createShape({
    type: AVV_COMPONENT_TYPE,
    x: 100,
    y: 100,
    props: {
      w: 400,
      h: 300,
      name: "Hero Section",
      status: "ready" as const,
      html: '<div style="padding:40px;text-align:center"><h1 style="font-size:32px;font-weight:bold;margin-bottom:16px">Welcome to AVV</h1><p style="font-size:16px;color:#64748b">AI Visual Vibe Engineer</p></div>',
      css: "",
      prompt: "A hero section for AVV",
      agentId: "demo",
      iteration: 0,
    },
  });
}

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
  const [propsOpen, setPropsOpen] = useState(false);

  const onMount = useCallback((ed: Editor) => {
    setEditor(ed);
    handleMount(ed);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw shapeUtils={customShapeUtils} onMount={onMount} />
      <LayersPanel editor={editor} isOpen={layersOpen} onToggle={() => setLayersOpen(!layersOpen)} />
      <PropertiesPanel editor={editor} isOpen={propsOpen} onToggle={() => setPropsOpen(!propsOpen)} />
    </div>
  );
}
