import type { TLBaseShape } from "tldraw";
import type { ComponentStatus, PageSection } from "@avv/shared";

export const AVV_PAGE_TYPE = "avv-page" as const;

export interface AVVPageProps {
  w: number;
  h: number;
  title: string;
  status: ComponentStatus;
  /** JSON-serialized PageSection[] — tldraw props must be primitives */
  sectionsJson: string;
  prompt: string;
  mode: "simple" | "ultrathink";
}

export type AVVPageShape = TLBaseShape<typeof AVV_PAGE_TYPE, AVVPageProps>;

/** Helper to parse sections from the shape prop */
export function parseSections(json: string): PageSection[] {
  try {
    return JSON.parse(json) as PageSection[];
  } catch {
    return [];
  }
}

/** Helper to serialize sections into the shape prop */
export function serializeSections(sections: PageSection[]): string {
  return JSON.stringify(sections);
}
