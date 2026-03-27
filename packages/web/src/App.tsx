import { useState, useCallback, useRef } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useAgentLogs } from "./hooks/useAgentLogs";
import { useProjectSync } from "./hooks/useProjectSync";
import { TopBar, type Viewport } from "./components/layout/TopBar";
import { AgenticChat } from "./components/AgenticChat";
import { DesignSystemPicker } from "./components/DesignSystemPicker";
import { LayoutPicker } from "./components/LayoutPicker";
import { FullPagePreview } from "./components/FullPagePreview";
import { ScreenTabs } from "./components/ScreenTabs";
import { DesignSystemPanel } from "./components/DesignSystemPanel";

const MAX_QUEUED_MESSAGES = 200;

export function App() {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [toast, setToast] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const messageQueueRef = useRef<ServerMessage[]>([]);
  const [messageSeq, setMessageSeq] = useState(0);

  const {
    project,
    phase,
    designSystemOptions,
    layoutOptions,
    activeScreenId,
    setActiveScreenId,
    handleMessage: handleProjectMessage,
  } = useProjectSync();
  const { handleMessage: handleLogMessage } = useAgentLogs();

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleProjectMessage(msg);
      handleLogMessage(msg);

      if (
        msg.type === "generation:created" ||
        msg.type === "figma:pushing" ||
        msg.type === "designsystem:options" ||
        msg.type === "layout:options"
      ) {
        setIsGenerating(false);
      }
      if (msg.type === "designsystem:selected") {
        setIsGenerating(true);
      }
      if (msg.type === "generation:done" || msg.type === "error") {
        setIsGenerating(false);
      }

      const queue = messageQueueRef.current;
      queue.push(msg);
      if (queue.length > MAX_QUEUED_MESSAGES) {
        queue.splice(0, queue.length - MAX_QUEUED_MESSAGES);
      }
      setMessageSeq((s) => s + 1);
    },
    [handleProjectMessage, handleLogMessage]
  );

  const drainMessages = useCallback((): ServerMessage[] => {
    return messageQueueRef.current.splice(0);
  }, []);

  const { send: rawSend, isConnected, sessionId } = useAVVWebSocket({ onMessage });

  const send = useCallback((msg: ClientMessage) => {
    if (msg.type === "generate" || msg.type === "chat") {
      setIsGenerating(true);
    }
    rawSend(msg);
  }, [rawSend]);

  const activeScreen = project?.screens.find((s) => s.id === activeScreenId) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const renderMainContent = () => {
    if (phase === "design-system-picking" && designSystemOptions.length > 0) {
      return <DesignSystemPicker options={designSystemOptions} onSend={send} />;
    }

    if (phase === "layout-picking" && layoutOptions.length > 0 && activeScreenId) {
      return (
        <LayoutPicker
          options={layoutOptions}
          screenId={activeScreenId}
          designSystem={project?.designSystem ?? null}
          onSend={send}
        />
      );
    }

    if (phase === "previewing" && activeScreen) {
      return (
        <FullPagePreview
          screen={activeScreen}
          designSystem={project?.designSystem ?? null}
          viewport={viewport}
        />
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center bg-stone-50">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-stone-200">auto_awesome</span>
          <p className="text-sm font-[Noto_Serif] italic text-stone-400">
            Describe the UI you want to build
          </p>
        </div>
      </div>
    );
  };

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

        {project && (project.screens.length > 0 || project.designSystem) && (
          <ScreenTabs
            screens={project.screens}
            activeScreenId={activeScreenId}
            designSystem={project.designSystem}
            onSelectScreen={setActiveScreenId}
            onSend={send}
          />
        )}

        {renderMainContent()}

        {phase === "previewing" && project?.designSystem && (
          <DesignSystemPanel designSystem={project.designSystem} onSend={send} />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white px-4 py-2 rounded-lg text-xs font-[Public_Sans] z-[100] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
