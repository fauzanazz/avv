import { useState, useCallback, useRef, useEffect } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { ImageResult } from "@avv/shared";
import { AVVComponentShapeUtil, AVV_COMPONENT_TYPE } from "./canvas/shapes";
import { LayersPanel } from "./components/LayersPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ChatPanel } from "./components/ChatPanel";
import { useImagePatching } from "./canvas/hooks/useImagePatching";

const customShapeUtils = [AVVComponentShapeUtil];

interface Question {
  questionId: string;
  question: string;
  options?: string[];
}

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
  const [chatOpen, setChatOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [spec, setSpec] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<ImageResult | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.hostname;
    const wsPort = import.meta.env.DEV ? "3000" : window.location.port;
    const ws = new WebSocket(`${wsProtocol}//${wsHost}${wsPort ? `:${wsPort}` : ""}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ultrathink:question") {
        setChatOpen(true);
        setQuestions((prev) => [...prev, { questionId: msg.questionId, question: msg.question, options: msg.options }]);
      }
      if (msg.type === "ultrathink:spec") {
        setSpec(msg.spec);
      }
      if (msg.type === "image:ready") {
        setImageResult(msg.image);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const send = useCallback((data: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(data));
  }, []);

  const handleAnswer = useCallback((questionId: string, answer: string) => {
    send({ type: "ultrathink:answer", questionId, answer });
  }, [send]);

  const handleConfirm = useCallback(() => {
    send({ type: "ultrathink:confirm" });
  }, [send]);

  useImagePatching(editor, imageResult);

  const onMount = useCallback((ed: Editor) => {
    setEditor(ed);
    handleMount(ed);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw shapeUtils={customShapeUtils} onMount={onMount} />
      <LayersPanel editor={editor} isOpen={layersOpen} onToggle={() => setLayersOpen(!layersOpen)} />
      <PropertiesPanel editor={editor} isOpen={propsOpen} onToggle={() => setPropsOpen(!propsOpen)} />
      <ChatPanel
        isOpen={chatOpen}
        questions={questions}
        spec={spec}
        onAnswer={handleAnswer}
        onConfirm={handleConfirm}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
