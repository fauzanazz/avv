import { useMemo, useEffect, useRef } from "react";

interface PagePreviewProps {
  html: string;
  css: string;
  width: number;
  height: number;
  /** Called when iframe content height changes */
  onContentHeight?: (height: number) => void;
}

const TAILWIND_CDN = `<script src="https://cdn.tailwindcss.com"></script>`;

/**
 * Script injected into iframe that reports content height to parent.
 * Uses ResizeObserver on <body> to detect height changes.
 * Reports via postMessage with a unique channel key.
 */
const HEIGHT_REPORTER_SCRIPT = `
<script>
(function() {
  var reported = 0;
  function report() {
    var h = document.body.scrollHeight;
    if (h !== reported && h > 0) {
      reported = h;
      window.parent.postMessage({ type: 'avv-iframe-height', height: h }, '*');
    }
  }
  // Report after initial paint
  if (document.readyState === 'complete') {
    setTimeout(report, 100);
  } else {
    window.addEventListener('load', function() { setTimeout(report, 100); });
  }
  // Report on resize (Tailwind CDN loads async and may reflow)
  new ResizeObserver(report).observe(document.body);
  // Fallback polling for Tailwind CDN async load
  var attempts = 0;
  var poll = setInterval(function() {
    report();
    attempts++;
    if (attempts > 20) clearInterval(poll);
  }, 200);
})();
</script>`;

export function PagePreview({ html, css, width, height, onContentHeight }: PagePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
  <body>${html}${HEIGHT_REPORTER_SCRIPT}</body>
</html>`,
    [html, css]
  );

  // Listen for height messages from this iframe
  useEffect(() => {
    if (!onContentHeight) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "avv-iframe-height" && typeof event.data.height === "number") {
        onContentHeight(event.data.height);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onContentHeight]);

  return (
    <iframe
      ref={iframeRef}
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
