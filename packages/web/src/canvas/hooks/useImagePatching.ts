import { useEffect } from "react";
import type { Editor } from "tldraw";
import type { ImageResult } from "@avv/shared";
import { AVV_COMPONENT_TYPE } from "../shapes";

/**
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
 * When the server sends an image:ready message, find the target component
 * by componentId and replace placeholder SVGs with the real image data URI.
=======
 * When the server sends an image:ready message, find the component
 * on the canvas and update its HTML to replace the placeholder
=======
 * When the server sends an image:ready message, find the matching component
 * on the canvas by componentId and update its HTML to replace the placeholder
>>>>>>> ba6676d (fix: address code review feedback across UltraThink and supporting modules [FAU-41])
 * with the real image data URI.
>>>>>>> 48465d1 (feat: implement async image generation subagent [FAU-38])
=======
 * When the server sends an image:ready message, find the component
 * on the canvas and update its HTML to replace the placeholder
 * with the real image data URI.
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
 */
export function useImagePatching(editor: Editor | null, imageResult: ImageResult | null) {
  useEffect(() => {
    if (!editor || !imageResult) return;

    const shapes = editor.getCurrentPageShapes();
    for (const shape of shapes) {
      if (shape.type !== AVV_COMPONENT_TYPE) continue;

<<<<<<< HEAD
<<<<<<< HEAD
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
=======
      const props = shape.props as any;
      if (props.componentId === imageResult.componentId && props.html?.includes("Generating image...")) {
=======
      const props = shape.props as any;
      if (props.agentId && props.html?.includes("Generating image...")) {
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
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
<<<<<<< HEAD
          break;
        }
>>>>>>> 48465d1 (feat: implement async image generation subagent [FAU-38])
=======
        }
>>>>>>> 60d7567 (feat: implement async image generation subagent [FAU-38])
      }
    }
  }, [editor, imageResult]);
}
