import { useState, useCallback } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { ServerMessage, ImageResult } from "@avv/shared";
import { AVVPageShapeUtil } from "./canvas/shapes";
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

const customShapeUtils = [AVVPageShapeUtil];

interface Question {
  questionId: string;
  question: string;
  options?: string[];
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
                pageId: ctxMenu.pageId,
                sectionId: ctxMenu.sectionId,
                sectionName: ctxMenu.sectionName,
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
