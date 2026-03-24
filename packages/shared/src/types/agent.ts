/** A single component in the orchestrator's decomposition plan */
export interface ComponentPlan {
  name: string;
  description: string;
  htmlTag: string;
  order: number;
  width: number;
  height: number;
  x: number;
  y: number;
  designGuidance: string;
}

/** The full plan output by the orchestrator */
export interface DesignPlan {
  title: string;
  summary: string;
  components: ComponentPlan[];
}
