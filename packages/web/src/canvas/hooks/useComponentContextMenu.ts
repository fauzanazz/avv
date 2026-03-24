import { useState, useCallback } from "react";
import type { Editor } from "tldraw";
import { AVV_COMPONENT_TYPE, type AVVComponentProps } from "../shapes";

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  componentId: string;
  componentName: string;
  currentHtml: string;
  currentCss: string;
  iteration: number;
}

const INITIAL_STATE: ContextMenuState = {
  isOpen: false, x: 0, y: 0,
  componentId: "", componentName: "", currentHtml: "", currentCss: "", iteration: 0,
};

export function useComponentContextMenu(editor: Editor | null) {
  const [state, setState] = useState<ContextMenuState>(INITIAL_STATE);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!editor) return;

      const selectedShapes = editor.getSelectedShapes();
      const avvShape = selectedShapes.find((s) => s.type === AVV_COMPONENT_TYPE);

      if (!avvShape) return;

      e.preventDefault();
      const props = avvShape.props as AVVComponentProps;

      setState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        componentId: avvShape.id,
        componentName: props.name,
        currentHtml: props.html,
        currentCss: props.css,
        iteration: props.iteration,
      });
    },
    [editor]
  );

  const close = useCallback(() => setState(INITIAL_STATE), []);

  return { state, handleContextMenu, close };
}
