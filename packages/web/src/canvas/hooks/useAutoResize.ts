import { useCallback, useRef } from "react";
import type { Editor } from "tldraw";
import { AVV_PAGE_TYPE } from "../shapes";

const TITLE_BAR_HEIGHT = 36;
const MIN_HEIGHT = 200;
const DEBOUNCE_MS = 150;

/**
 * Hook that handles auto-resizing page shapes based on iframe content height.
 * Returns a callback to pass as `onContentHeight` to PagePreview.
 */
export function useAutoResize(editor: Editor | null, shapeId: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContentHeight = useCallback(
    (contentHeight: number) => {
      if (!editor || !shapeId) return;

      // Debounce rapid updates during generation
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const shape = editor.getShape(shapeId as any);
        if (!shape || shape.type !== AVV_PAGE_TYPE) return;

        const targetH = Math.max(MIN_HEIGHT, contentHeight + TITLE_BAR_HEIGHT);
        const currentH = (shape.props as any).h as number;

        // Only resize if difference is significant (>10px) to avoid jitter
        if (Math.abs(targetH - currentH) > 10) {
          editor.updateShape({
            id: shape.id,
            type: AVV_PAGE_TYPE,
            props: { h: targetH },
          });
        }
      }, DEBOUNCE_MS);
    },
    [editor, shapeId]
  );

  return { handleContentHeight };
}
