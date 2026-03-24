import type { Editor } from "tldraw";
import { exportToBlob } from "tldraw";
import { AVV_PAGE_TYPE, parseSections, type AVVPageProps } from "../canvas/shapes";

function getPageData(editor: Editor) {
  const shapes = editor.getCurrentPageShapes();
  const pageShape = editor.getSelectedShapes().find((s) => s.type === AVV_PAGE_TYPE)
    ?? shapes.find((s) => s.type === AVV_PAGE_TYPE);
  if (!pageShape) return null;

  const props = pageShape.props as AVVPageProps;
  const sections = parseSections(props.sectionsJson)
    .filter((s) => s.status === "ready" && s.html)
    .sort((a, b) => a.order - b.order);

  const html = sections.map((s) => `<!-- ${s.name} -->\n<section>${s.html}</section>`).join("\n\n");
  const css = sections.filter((s) => s.css).map((s) => s.css).join("\n");

  return { id: pageShape.id, title: props.title, html, css };
}

function slugify(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "avv-export"; }

function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportAsHtml(editor: Editor): void {
  const page = getPageData(editor);
  if (!page) { alert("No page to export."); return; }

  const blob = new Blob([`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${page.title}</title><script src="https://cdn.tailwindcss.com"></script>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}${page.css}</style>
</head><body>${page.html}</body></html>`], { type: "text/html" });
  downloadBlob(blob, `${slugify(page.title)}.html`);
}

export async function exportAsPng(editor: Editor): Promise<void> {
  const page = getPageData(editor);
  if (!page) { alert("No page to export."); return; }
  try {
    const blob = await exportToBlob({ editor, ids: [page.id], format: "png", opts: { background: true, padding: 0, scale: 2 } });
    if (!blob) { alert("PNG export failed."); return; }
    downloadBlob(blob, `${slugify(page.title)}.png`);
  } catch { alert("PNG export failed."); }
}

export async function copyHtmlToClipboard(editor: Editor): Promise<boolean> {
  const page = getPageData(editor);
  if (!page) return false;
  try { await navigator.clipboard.writeText(page.html); return true; } catch { return false; }
}

export async function exportAsSvg(editor: Editor): Promise<boolean> {
  const page = getPageData(editor);
  if (!page) return false;
  try {
    const blob = await exportToBlob({ editor, ids: [page.id], format: "svg", opts: { background: true, padding: 0 } });
    if (!blob) return false;
    await navigator.clipboard.writeText(await blob.text());
    return true;
  } catch { return false; }
}
