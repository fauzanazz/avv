import { useRef, useEffect } from "react";

interface ComponentPreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
}

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

export function ComponentPreview({ html, css, width, height }: ComponentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
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
      </html>
    `);
    doc.close();
  }, [html, css]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-same-origin"
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
