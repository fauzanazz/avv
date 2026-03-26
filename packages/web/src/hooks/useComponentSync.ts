import { useState, useCallback } from "react";
import type { ServerMessage, GenerationSession, ViewerComponent } from "@avv/shared";

interface UseComponentSyncReturn {
  session: GenerationSession | null;
  selectedComponentId: string | null;
  setSelectedComponentId: (id: string | null) => void;
  handleMessage: (msg: ServerMessage) => void;
}

export function useComponentSync(): UseComponentSyncReturn {
  const [session, setSession] = useState<GenerationSession | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "generation:created": {
        setSession(msg.session);
        if (msg.session.components.length > 0) {
          setSelectedComponentId(msg.session.components[0].id);
        }
        break;
      }

      case "component:updated": {
        setSession((prev) => {
          if (!prev || prev.id !== msg.sessionId) return prev;
          const components = prev.components.map((c) => {
            if (c.id !== msg.componentId) return c;
            const updates = msg.updates as Partial<ViewerComponent>;
            const merged = { ...c, ...updates };
            if (updates.variants) {
              merged.variants = [...c.variants, ...updates.variants];
            }
            return merged;
          });
          const allReady = components.every((c) => c.status === "ready");
          const anyError = components.some((c) => c.status === "error");
          return {
            ...prev,
            components,
            status: allReady ? "ready" : anyError ? "error" : "generating",
          };
        });
        break;
      }

      case "component:status": {
        setSession((prev) => {
          if (!prev || prev.id !== msg.sessionId) return prev;
          const components = prev.components.map((c) =>
            c.id === msg.componentId ? { ...c, status: msg.status } : c
          );
          const allReady = components.every((c) => c.status === "ready");
          const anyError = components.some((c) => c.status === "error");
          return {
            ...prev,
            components,
            status: allReady ? "ready" : anyError ? "error" : "generating",
          };
        });
        break;
      }

      case "generation:status": {
        setSession((prev) => {
          if (!prev || prev.id !== msg.sessionId) return prev;
          return { ...prev, status: msg.status };
        });
        break;
      }
    }
  }, []);

  return { session, selectedComponentId, setSelectedComponentId, handleMessage };
}
