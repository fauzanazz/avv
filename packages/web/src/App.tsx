import { useState, useCallback, useRef } from "react";
import type { ServerMessage } from "@avv/shared";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useAgentLogs } from "./hooks/useAgentLogs";
import { useComponentSync } from "./hooks/useComponentSync";
import { TopBar, type Viewport } from "./components/layout/TopBar";
import { AgenticChat } from "./components/AgenticChat";
import { ComponentList } from "./components/ComponentList";
import { ComponentPreview } from "./components/ComponentPreview";
import { exportComponentAsHtml, copyComponentHtml } from "./utils/export";

const MAX_QUEUED_MESSAGES = 200;

export function App() {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const messageQueueRef = useRef<ServerMessage[]>([]);
  const [messageSeq, setMessageSeq] = useState(0);

  const { session, selectedComponentId, setSelectedComponentId, handleMessage: handleComponentMessage } = useComponentSync();
  const { handleMessage: handleLogMessage } = useAgentLogs();

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleComponentMessage(msg);
      handleLogMessage(msg);

      if (msg.type === "generation:created" || msg.type === "figma:pushing") {
        setIsGenerating(true);
      }
      if (msg.type === "generation:done" || msg.type === "error" || msg.type === "figma:pushed" || msg.type === "figma:error") {
        setIsGenerating(false);
      }

      const queue = messageQueueRef.current;
      queue.push(msg);
      if (queue.length > MAX_QUEUED_MESSAGES) {
        queue.splice(0, queue.length - MAX_QUEUED_MESSAGES);
      }
      setMessageSeq((s) => s + 1);
    },
    [handleComponentMessage, handleLogMessage]
  );

  const drainMessages = useCallback((): ServerMessage[] => {
    return messageQueueRef.current.splice(0);
  }, []);

  const { send: rawSend, isConnected, sessionId } = useAVVWebSocket({ onMessage });

  const send = useCallback((msg: import("@avv/shared").ClientMessage) => {
    if (msg.type === "generate" || msg.type === "chat") {
      setIsGenerating(true);
    }
    rawSend(msg);
  }, [rawSend]);

  const selectedComponent = session?.components.find((c) => c.id === selectedComponentId) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleExportHtml = useCallback(() => {
    if (!selectedComponent) return;
    const variant = selectedComponent.variants.find((v) => v.id === activeVariantId)
      ?? selectedComponent.variants[selectedComponent.variants.length - 1];
    if (variant) {
      exportComponentAsHtml(selectedComponent.name, variant);
      showToast("HTML downloaded");
    }
  }, [selectedComponent, activeVariantId, showToast]);

  const handleCopyHtml = useCallback(async () => {
    if (!selectedComponent) return;
    const variant = selectedComponent.variants.find((v) => v.id === activeVariantId)
      ?? selectedComponent.variants[selectedComponent.variants.length - 1];
    if (variant) {
      const ok = await copyComponentHtml(variant);
      showToast(ok ? "HTML copied" : "Copy failed");
    }
  }, [selectedComponent, activeVariantId, showToast]);

  const handleRetry = useCallback((genSessionId: string, componentId: string) => {
    send({ type: "retry", sessionId: genSessionId, componentId });
  }, [send]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-stone-50">
      <TopBar
        isConnected={isConnected}
        viewport={viewport}
        onViewportChange={setViewport}
      />

      <div className="flex flex-1 min-h-0">
        <AgenticChat
          messageSeq={messageSeq}
          drainMessages={drainMessages}
          isConnected={isConnected}
          sessionId={sessionId}
          isGenerating={isGenerating}
          onSend={send}
        />

        <ComponentList
          session={session}
          selectedId={selectedComponentId}
          onSelect={(id) => {
            setSelectedComponentId(id);
            setActiveVariantId(null);
          }}
          onRetry={handleRetry}
        />

        <ComponentPreview
          component={selectedComponent}
          viewport={viewport}
          activeVariantId={activeVariantId}
          onVariantSelect={setActiveVariantId}
          onExportHtml={handleExportHtml}
          onCopyHtml={handleCopyHtml}
        />
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white px-4 py-2 rounded-lg text-xs font-[Public_Sans] z-[100] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
