import { useState, useCallback } from "react";
import type { Editor } from "tldraw";
import { AVV_PAGE_TYPE, type AVVPageProps, parseSections } from "../shapes";

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  pageId: string;
  sectionId: string;
  sectionName: string;
  currentHtml: string;
  currentCss: string;
  iteration: number;
}

const INITIAL_STATE: ContextMenuState = {
  isOpen: false, x: 0, y: 0,
  pageId: "", sectionId: "", sectionName: "", currentHtml: "", currentCss: "", iteration: 0,
};

export function useComponentContextMenu(editor: Editor | null) {
  const [state, setState] = useState<ContextMenuState>(INITIAL_STATE);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!editor) return;

      const selectedShapes = editor.getSelectedShapes();
      const avvShape = selectedShapes.find((s) => s.type === AVV_PAGE_TYPE);

      if (!avvShape) return;

      e.preventDefault();
      const props = avvShape.props as AVVPageProps;
      const sections = parseSections(props.sectionsJson).sort((a, b) => a.order - b.order);

      // Default to the first ready section for iteration
      const readySection = sections.find((s) => s.status === "ready");
      if (!readySection) return;

      setState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        pageId: avvShape.id,
        sectionId: readySection.id,
        sectionName: readySection.name,
        currentHtml: readySection.html,
        currentCss: readySection.css,
        iteration: readySection.iteration,
      });
    },
    [editor]
  );

  const close = useCallback(() => setState(INITIAL_STATE), []);

  return { state, handleContextMenu, close };
}
