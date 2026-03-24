/** A section in the orchestrator's decomposition plan */
export interface SectionPlan {
  name: string;
  description: string;
  htmlTag: string;
  order: number;
  designGuidance: string;
}

/** The full plan output by the orchestrator */
export interface DesignPlan {
  title: string;
  summary: string;
  sections: SectionPlan[];
}

/** Image generation request */
export interface ImageRequest {
  requestId: string;
  sectionId: string;
  pageId: string;
  description: string;
  width: number;
  height: number;
  style: "photo" | "illustration" | "icon" | "abstract";
}

/** Image generation result */
export interface ImageResult {
  requestId: string;
  sectionId: string;
  pageId: string;
  dataUri: string;
  width: number;
  height: number;
}
