import { useMemo } from "react";

interface PagePreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
}

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

/**
 * Renders the full stitched page HTML in a single iframe.
 * All sections are rendered together so they share visual context.
 */
export function PagePreview({ html, css, width, height }: PagePreviewProps) {
  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${TAILWIND_CDN}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
      section { width: 100%; }
      ${css}
    </style>
  </head>
  <body>${html}</body>
</html>`,
    [html, css]
  );

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{
        width,
        height,
        border: "none",
        pointerEvents: "none",
      }}
      title="Page Preview"
    />
  );
}
