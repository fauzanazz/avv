import type { PageSection } from "@avv/shared";

const VALID_STATUSES = new Set(["pending", "generating", "ready", "error"]);

function hasRequiredKeys(item: unknown): item is Record<string, unknown> {
  if (typeof item !== "object" || item === null) return false;
  const s = item as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.status === "string" && VALID_STATUSES.has(s.status) &&
    typeof s.order === "number"
  );
}

/** Normalize a raw object into a full PageSection, providing safe defaults for optional fields. */
function normalizeSection(raw: Record<string, unknown>): PageSection {
  return {
    id: raw.id as string,
    name: raw.name as string,
    status: raw.status as PageSection["status"],
    order: raw.order as number,
    html: typeof raw.html === "string" ? raw.html : "",
    css: typeof raw.css === "string" ? raw.css : "",
    prompt: typeof raw.prompt === "string" ? raw.prompt : "",
    agentId: typeof raw.agentId === "string" ? raw.agentId : "",
    iteration: typeof raw.iteration === "number" ? raw.iteration : 0,
  };
}

export function parseSections(json: string): PageSection[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(hasRequiredKeys).map(normalizeSection);
  } catch {
    return [];
  }
}
