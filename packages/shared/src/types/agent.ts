/** A component in the orchestrator's decomposition plan */
export interface ComponentPlan {
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
  components: ComponentPlan[];
}

/** Image generation request */
export interface ImageRequest {
  requestId: string;
  componentId: string;
  sessionId: string;
  description: string;
  width: number;
  height: number;
  style: "photo" | "illustration" | "icon" | "abstract";
}

/** Image generation result */
export interface ImageResult {
  requestId: string;
  componentId: string;
  sessionId: string;
  dataUri: string;
  width: number;
  height: number;
}
