import type { PageSection } from "@avv/shared";

const VALID_STATUSES = new Set(["pending", "generating", "ready", "error"]);

function isValidSection(item: unknown): item is PageSection {
  if (typeof item !== "object" || item === null) return false;
  const s = item as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.status === "string" && VALID_STATUSES.has(s.status) &&
    typeof s.order === "number"
  );
}

export function parseSections(json: string): PageSection[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSection);
  } catch {
    return [];
  }
}
