import { useState, useCallback } from "react";
import type { ServerMessage, Project, Screen, DesignSystem, LayoutOption } from "@avv/shared";

export type AppPhase = "chatting" | "design-system-picking" | "layout-picking" | "previewing";

interface UseProjectSyncReturn {
  project: Project | null;
  phase: AppPhase;
  designSystemOptions: DesignSystem[];
  layoutOptions: LayoutOption[];
  activeScreenId: string | null;
  setActiveScreenId: (id: string) => void;
  handleMessage: (msg: ServerMessage) => void;
}

export function useProjectSync(): UseProjectSyncReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [phase, setPhase] = useState<AppPhase>("chatting");
  const [designSystemOptions, setDesignSystemOptions] = useState<DesignSystem[]>([]);
  const [layoutOptions, setLayoutOptions] = useState<LayoutOption[]>([]);
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "project:created": {
        setProject(msg.project);
        break;
      }

      case "designsystem:options": {
        setDesignSystemOptions(msg.options);
        setPhase("design-system-picking");
        break;
      }

      case "designsystem:selected": {
        setProject((prev) => prev ? { ...prev, designSystem: msg.designSystem } : prev);
        setPhase("chatting");
        break;
      }

      case "designsystem:updated": {
        setProject((prev) => prev ? { ...prev, designSystem: msg.designSystem } : prev);
        break;
      }

      case "screen:created": {
        setProject((prev) => {
          if (!prev) return prev;
          return { ...prev, screens: [...prev.screens, msg.screen] };
        });
        setActiveScreenId(msg.screen.id);
        break;
      }

      case "screen:updated": {
        setProject((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            screens: prev.screens.map((s) =>
              s.id === msg.screenId ? { ...s, ...msg.updates } : s
            ),
          };
        });
        break;
      }

      case "layout:options": {
        setLayoutOptions(msg.options);
        setActiveScreenId(msg.screenId);
        setPhase("layout-picking");
        break;
      }

      case "layout:selected": {
        setPhase("previewing");
        setActiveScreenId(msg.screenId);
        break;
      }
    }
  }, []);

  return {
    project,
    phase,
    designSystemOptions,
    layoutOptions,
    activeScreenId,
    setActiveScreenId,
    handleMessage,
  };
}
