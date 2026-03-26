import type { ComponentVariant } from "@avv/shared";

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "avv-export";
}

function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportComponentAsHtml(name: string, variant: ComponentVariant): void {
  const blob = new Blob([`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${name}</title><script src="https://cdn.tailwindcss.com"><\/script>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}${variant.css}</style>
</head><body>${variant.html}</body></html>`], { type: "text/html" });
  downloadBlob(blob, `${slugify(name)}.html`);
}

export async function copyComponentHtml(variant: ComponentVariant): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(variant.html);
    return true;
  } catch {
    return false;
  }
}
