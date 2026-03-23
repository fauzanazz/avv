import { useMemo } from "react";

interface ComponentPreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
}

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

/**
 * Renders generated HTML/CSS in a sandboxed iframe with Tailwind CSS support.
 * Uses srcDoc to avoid needing allow-same-origin for contentDocument access.
 */
export function ComponentPreview({ html, css, width, height }: ComponentPreviewProps) {
  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${TAILWIND_CDN}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }
      ${css}
    </style>
  </head>
  <body>${html}</body>
</html>`,
    [html, css],
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
      title="Component Preview"
    />
  );
}
