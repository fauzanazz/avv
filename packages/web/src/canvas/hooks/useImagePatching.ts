import { useEffect } from "react";
import type { Editor } from "tldraw";
import type { ImageResult } from "@avv/shared";
import { AVV_COMPONENT_TYPE } from "../shapes";

/**
 * When the server sends an image:ready message, find the target component
 * by componentId and replace placeholder SVGs with the real image data URI.
 */
export function useImagePatching(editor: Editor | null, imageResult: ImageResult | null) {
  useEffect(() => {
    if (!editor || !imageResult) return;

    const shapes = editor.getCurrentPageShapes();
    for (const shape of shapes) {
      if (shape.type !== AVV_COMPONENT_TYPE) continue;

      const props = shape.props as Record<string, unknown>;

      // Only patch the component that requested this image
      if (props.componentId !== imageResult.componentId) continue;

      const html = props.html as string | undefined;
      if (!html?.includes("Generating image...")) continue;

      // Replace placeholder SVGs with the real image
      const updatedHtml = html.replace(
        /data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g,
        imageResult.dataUri
      );

      if (updatedHtml !== html) {
        editor.updateShape({
          id: shape.id,
          type: AVV_COMPONENT_TYPE,
          props: { html: updatedHtml },
        });
      }
    }
  }, [editor, imageResult]);
}
