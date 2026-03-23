import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { AVVComponentShapeUtil, AVV_COMPONENT_TYPE } from "./canvas/shapes";

const customShapeUtils = [AVVComponentShapeUtil];

function handleMount(editor: Editor) {
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
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw shapeUtils={customShapeUtils} onMount={handleMount} />
    </div>
  );
}
