import type { ComponentPlan } from "@avv/shared";

class PlanStore {
  private plans = new Map<string, Map<string, ComponentPlan>>();

  save(pageId: string, sectionId: string, plan: ComponentPlan): void {
    if (!this.plans.has(pageId)) this.plans.set(pageId, new Map());
    this.plans.get(pageId)!.set(sectionId, plan);
  }

  get(pageId: string, sectionId: string): ComponentPlan | undefined {
    return this.plans.get(pageId)?.get(sectionId);
  }
}

export const planStore = new PlanStore();
