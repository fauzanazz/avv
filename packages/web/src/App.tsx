import { useState, useCallback, useRef } from "react";
import { Tldraw, useValue, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { ServerMessage } from "@avv/shared";
import { AVVPageShapeUtil } from "./canvas/shapes";
import { useAVVWebSocket } from "./hooks/useAVVWebSocket";
import { useCanvasSync } from "./hooks/useCanvasSync";
import { useAgentLogs } from "./hooks/useAgentLogs";
import { TopBar } from "./components/layout/TopBar";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { RightPanel } from "./components/layout/RightPanel";

const customShapeUtils = [AVVPageShapeUtil];

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Queue-based message passing: ref accumulates messages, state triggers drain
  const messageQueueRef = useRef<ServerMessage[]>([]);
  const [messageSeq, setMessageSeq] = useState(0);

  const { handleMessage: handleCanvasMessage } = useCanvasSync(editor);
  const { handleMessage: handleLogMessage } = useAgentLogs();

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      handleCanvasMessage(msg);
      handleLogMessage(msg);
      messageQueueRef.current.push(msg);
      setMessageSeq((s) => s + 1);
    },
    [handleCanvasMessage, handleLogMessage]
  );

  const drainMessages = useCallback((): ServerMessage[] => {
    return messageQueueRef.current.splice(0);
  }, []);

  const { send, isConnected, sessionId } = useAVVWebSocket({ onMessage });

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-stone-900">
      <TopBar
        editor={editor}
        isConnected={isConnected}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen(!leftOpen)}
        onToggleRight={() => setRightOpen(!rightOpen)}
      />

      <div className="flex flex-1 min-h-0">
        {leftOpen && (
          <LeftSidebar
            editor={editor}
            onClose={() => setLeftOpen(false)}
            onRetry={(pageId, sectionId) => send({ type: "retry", pageId, sectionId })}
          />
        )}

        <main
          className="flex-1 relative overflow-hidden"
          style={{
            background: "#1c1917",
            backgroundImage: "radial-gradient(circle, #44403c 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        >
          <div className="absolute inset-0">
            <Tldraw
              shapeUtils={customShapeUtils}
              onMount={setEditor}
              hideUi
              persistenceKey="avv-canvas"
            />
          </div>

          <ZoomControls editor={editor} />

          {!leftOpen && (
            <button onClick={() => setLeftOpen(true)} className="absolute top-3 left-3 z-20 p-2 bg-stone-800/80 backdrop-blur text-stone-400 rounded-lg hover:text-white">
              <span className="material-symbols-outlined text-sm">menu</span>
            </button>
          )}
          {!rightOpen && (
            <button onClick={() => setRightOpen(true)} className="absolute top-3 right-3 z-20 p-2 bg-stone-800/80 backdrop-blur text-stone-400 rounded-lg hover:text-white">
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
            </button>
          )}
        </main>

        {rightOpen && (
          <RightPanel
            messageSeq={messageSeq}
            drainMessages={drainMessages}
            isConnected={isConnected}
            sessionId={sessionId}
            onSend={send}
            onClose={() => setRightOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function ZoomControls({ editor }: { editor: Editor | null }) {
  const zoomLevel = useValue("zoom", () => editor?.getZoomLevel() ?? 1, [editor]);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-800/90 backdrop-blur text-white px-4 py-2 rounded-full flex items-center gap-4 text-xs font-[Public_Sans] z-20">
      <button onClick={() => editor?.zoomOut()} className="hover:text-blue-400"><span className="material-symbols-outlined text-sm">remove</span></button>
      <span>{Math.round(zoomLevel * 100)}%</span>
      <button onClick={() => editor?.zoomIn()} className="hover:text-blue-400"><span className="material-symbols-outlined text-sm">add</span></button>
      <div className="w-px h-4 bg-stone-600" />
      <button onClick={() => editor?.zoomToFit({ animation: { duration: 300 } })} className="hover:text-blue-400"><span className="material-symbols-outlined text-sm">fit_screen</span></button>
    </div>
  );
}
