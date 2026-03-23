import { useEffect } from "react";
import type { Editor } from "tldraw";
import type { ImageResult } from "@avv/shared";
import { AVV_COMPONENT_TYPE } from "../shapes";

/**
 * When the server sends an image:ready message, find the component
 * on the canvas and update its HTML to replace the placeholder
 * with the real image data URI.
 */
export function useImagePatching(editor: Editor | null, imageResult: ImageResult | null) {
  useEffect(() => {
    if (!editor || !imageResult) return;

    const shapes = editor.getCurrentPageShapes();
    for (const shape of shapes) {
      if (shape.type !== AVV_COMPONENT_TYPE) continue;

      const props = shape.props as any;
      if (props.agentId && props.html?.includes("Generating image...")) {
        const updatedHtml = props.html.replace(
          /data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g,
          imageResult.dataUri
        );

        if (updatedHtml !== props.html) {
          editor.updateShape({
            id: shape.id,
            type: AVV_COMPONENT_TYPE,
            props: { html: updatedHtml },
          });
        }
      }
    }
  }, [editor, imageResult]);
}
