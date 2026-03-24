import { useCallback, useRef } from "react";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";
import type { ServerMessage } from "@avv/shared";
import { AVV_PAGE_TYPE, type AVVPageProps, parseSections, serializeSections } from "../canvas/shapes";

/** Maps server page IDs to tldraw shape IDs */
type PageShapeMap = Map<string, TLShapeId>;

interface UseCanvasSyncReturn {
  handleMessage: (msg: ServerMessage) => void;
}

export function useCanvasSync(editor: Editor | null): UseCanvasSyncReturn {
  const pageMapRef = useRef<PageShapeMap>(new Map());

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      if (!editor) return;

      switch (msg.type) {
        case "page:created": {
          const page = msg.page;
          const shapeId = createShapeId();
          pageMapRef.current.set(page.id, shapeId);

          editor.createShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            x: 100,
            y: 100,
            props: {
              w: 800,
              h: 600,
              title: page.title,
              status: page.status,
              sectionsJson: JSON.stringify(page.sections),
              prompt: page.prompt,
              mode: page.mode,
            } satisfies AVVPageProps,
          });
          break;
        }

        case "section:updated": {
          const shapeId = pageMapRef.current.get(msg.pageId);
          if (!shapeId) return;

          const shape = editor.getShape(shapeId);
          if (!shape) return;

          const props = shape.props as AVVPageProps;
          const sections = parseSections(props.sectionsJson);
          const idx = sections.findIndex((s) => s.id === msg.sectionId);
          if (idx === -1) return;

          sections[idx] = { ...sections[idx], ...msg.updates };

          // Derive page status from sections
          const allReady = sections.every((s) => s.status === "ready");
          const anyError = sections.some((s) => s.status === "error");

          editor.updateShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            props: {
              sectionsJson: serializeSections(sections),
              status: allReady ? "ready" : anyError ? "error" : "generating",
            },
          });
          break;
        }

        case "section:status": {
          const shapeId = pageMapRef.current.get(msg.pageId);
          if (!shapeId) return;

          const shape = editor.getShape(shapeId);
          if (!shape) return;

          const props = shape.props as AVVPageProps;
          const sections = parseSections(props.sectionsJson);
          const idx = sections.findIndex((s) => s.id === msg.sectionId);
          if (idx === -1) return;

          sections[idx] = { ...sections[idx], status: msg.status };

          editor.updateShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            props: { sectionsJson: serializeSections(sections) },
          });
          break;
        }

        case "page:status": {
          const shapeId = pageMapRef.current.get(msg.pageId);
          if (!shapeId) return;

          editor.updateShape({
            id: shapeId,
            type: AVV_PAGE_TYPE,
            props: { status: msg.status },
          });
          break;
        }

        case "generation:done": {
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
