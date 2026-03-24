import { useState, useCallback } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { ServerMessage, ImageResult } from "@avv/shared";
import { AVVComponentShapeUtil, AVV_COMPONENT_TYPE } from "./canvas/shapes";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useCanvasSync } from "./hooks/useCanvasSync";
import { useAgentLogs } from "./hooks/useAgentLogs";
import { useImagePatching } from "./canvas/hooks/useImagePatching";
import { useComponentContextMenu } from "./canvas/hooks/useComponentContextMenu";
import { PromptBar } from "./components/PromptBar";
import { StatusBar } from "./components/StatusBar";
import { LayersPanel } from "./components/LayersPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ComponentContextMenu } from "./components/ComponentContextMenu";

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

  // Canvas sync and agent logs hooks
  const { handleMessage: handleCanvasMessage } = useCanvasSync(editor);
  const { logs, handleMessage: handleLogMessage } = useAgentLogs();

  // Image patching — replaces placeholder SVGs with real images
  useImagePatching(editor, imageResult);

  // Central message handler — routes server messages to the right handler
  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleCanvasMessage(msg);
      handleLogMessage(msg);

      if (msg.type === "ultrathink:question") {
        setChatOpen(true);
        setQuestions((prev) => [
          ...prev,
          { questionId: msg.questionId, question: msg.question, options: msg.options },
        ]);
      }
      if (msg.type === "ultrathink:spec") {
        setSpec(msg.spec);
      }
      if (msg.type === "image:ready") {
        setImageResult(msg.image);
      }
    },
    [handleCanvasMessage, handleLogMessage]
  );

  const { send, isConnected, sessionId } = useAVVWebSocket({ onMessage });

  // PromptBar handler
  const handleGenerate = useCallback(
    (prompt: string, mode: "simple" | "ultrathink") => {
      // Reset ultrathink state for new generation
      setQuestions([]);
      setSpec(null);
      send({ type: "generate", prompt, mode });
    },
    [send]
  );

  // ChatPanel handlers
  const handleAnswer = useCallback(
    (questionId: string, answer: string) => {
      send({ type: "ultrathink:answer", questionId, answer });
    },
    [send]
  );

  const handleConfirm = useCallback(() => {
    send({ type: "ultrathink:confirm" });
  }, [send]);

  // Context menu
  const { state: ctxMenu, handleContextMenu, close: closeCtxMenu } = useComponentContextMenu(editor);

  const onMount = useCallback((ed: Editor) => {
    setEditor(ed);
    handleMount(ed);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <PromptBar onGenerate={handleGenerate} isConnected={isConnected} />

      <div style={{ flex: 1, position: "relative" }} onContextMenu={handleContextMenu}>
        <Tldraw shapeUtils={customShapeUtils} onMount={onMount} />

        {ctxMenu.isOpen && (
          <ComponentContextMenu
            {...ctxMenu}
            onIterate={(instruction) => {
              send({
                type: "iterate",
                componentId: ctxMenu.componentId,
                componentName: ctxMenu.componentName,
                currentHtml: ctxMenu.currentHtml,
                currentCss: ctxMenu.currentCss,
                instruction,
                iteration: ctxMenu.iteration,
              });
            }}
            onClose={closeCtxMenu}
          />
        )}

        <LayersPanel editor={editor} isOpen={layersOpen} onToggle={() => setLayersOpen(!layersOpen)} />
        <PropertiesPanel editor={editor} isOpen={propsOpen} onToggle={() => setPropsOpen(!propsOpen)} />
      </div>

      <StatusBar logs={logs} isConnected={isConnected} sessionId={sessionId} />

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
