import type { ComponentPlan } from "@avv/shared";

class PlanStore {
  private plans = new Map<string, Map<string, ComponentPlan>>();

  save(sessionId: string, componentId: string, plan: ComponentPlan): void {
    if (!this.plans.has(sessionId)) this.plans.set(sessionId, new Map());
    this.plans.get(sessionId)!.set(componentId, plan);
  }

  get(sessionId: string, componentId: string): ComponentPlan | undefined {
    return this.plans.get(sessionId)?.get(componentId);
  }

  deleteSession(sessionId: string): void {
    this.plans.delete(sessionId);
  }
}

export const planStore = new PlanStore();
