import { useCallback, useRef } from "react";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";
import type { ServerMessage } from "@avv/shared";
import { AVV_COMPONENT_TYPE, type AVVComponentProps } from "../canvas/shapes";

/** Maps server component IDs to tldraw shape IDs */
type ComponentShapeMap = Map<string, TLShapeId>;

interface UseCanvasSyncReturn {
  handleMessage: (msg: ServerMessage) => void;
}

export function useCanvasSync(editor: Editor | null): UseCanvasSyncReturn {
  const componentMapRef = useRef<ComponentShapeMap>(new Map());

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      if (!editor) return;

      switch (msg.type) {
        case "component:created": {
          const comp = msg.component;
          const shapeId = createShapeId();

          componentMapRef.current.set(comp.id, shapeId);
          componentMapRef.current.set(comp.name, shapeId);

          editor.createShape({
            id: shapeId,
            type: AVV_COMPONENT_TYPE,
            x: comp.x,
            y: comp.y,
            props: {
              w: comp.width,
              h: comp.height,
              name: comp.name,
              status: comp.status,
              html: comp.html,
              css: comp.css,
              prompt: comp.prompt,
              agentId: comp.agentId,
              iteration: comp.iteration,
            } satisfies AVVComponentProps,
          });
          break;
        }

        case "component:updated": {
          const shapeId = componentMapRef.current.get(msg.componentId);
          if (!shapeId) {
            console.warn(`[CanvasSync] Unknown component: ${msg.componentId}`);
            return;
          }

          const { x, y, width, height, ...rest } = msg.updates;
          const shapeUpdate: Record<string, unknown> = {
            id: shapeId,
            type: AVV_COMPONENT_TYPE,
          };
          if (x !== undefined) shapeUpdate.x = x;
          if (y !== undefined) shapeUpdate.y = y;
          const propUpdates: Partial<AVVComponentProps> = { ...rest };
          if (width !== undefined) propUpdates.w = width;
          if (height !== undefined) propUpdates.h = height;
          shapeUpdate.props = propUpdates;

          editor.updateShape(shapeUpdate as Parameters<typeof editor.updateShape>[0]);
          break;
        }

        case "component:status": {
          const shapeId = componentMapRef.current.get(msg.componentId);
          if (!shapeId) return;

          editor.updateShape({
            id: shapeId,
            type: AVV_COMPONENT_TYPE,
            props: { status: msg.status },
          });
          break;
        }

        case "generation:done": {
          console.log("[CanvasSync] Generation complete");
          editor.zoomToFit({ animation: { duration: 500 } });
          break;
        }

        case "error": {
          console.error("[CanvasSync] Server error:", msg.message);
          break;
        }
      }
    },
    [editor]
  );

  return { handleMessage };
}
