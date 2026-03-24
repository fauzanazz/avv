import { useEffect } from "react";
import type { Editor } from "tldraw";
import type { ImageResult } from "@avv/shared";
import { AVV_PAGE_TYPE, type AVVPageProps, parseSections, serializeSections } from "../shapes";

/**
 * When the server sends an image:ready message, find the target page shape
 * and replace placeholder SVGs with the real image data URI in the matching section.
 */
export function useImagePatching(editor: Editor | null, imageResult: ImageResult | null) {
  useEffect(() => {
    if (!editor || !imageResult) return;

    const shapes = editor.getCurrentPageShapes();
    for (const shape of shapes) {
      if (shape.type !== AVV_PAGE_TYPE) continue;

      const props = shape.props as AVVPageProps;
      const sections = parseSections(props.sectionsJson);
      const idx = sections.findIndex((s) => s.id === imageResult.sectionId);
      if (idx === -1) continue;

      const section = sections[idx];
      if (!section.html?.includes("Generating image...")) continue;

      const updatedHtml = section.html.replace(
        /data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g,
        imageResult.dataUri
      );

      if (updatedHtml !== section.html) {
        sections[idx] = { ...section, html: updatedHtml };
        editor.updateShape({
          id: shape.id,
          type: AVV_PAGE_TYPE,
          props: { sectionsJson: serializeSections(sections) },
        });
        break;
      }
    }
  }, [editor, imageResult]);
}
