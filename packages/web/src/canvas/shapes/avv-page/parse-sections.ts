import type { PageSection } from "@avv/shared";

export function parseSections(json: string): PageSection[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
