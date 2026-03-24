import type { SectionPlan } from "@avv/shared";

class PlanStore {
  private plans = new Map<string, Map<string, SectionPlan>>();

  save(pageId: string, sectionId: string, plan: SectionPlan): void {
    if (!this.plans.has(pageId)) this.plans.set(pageId, new Map());
    this.plans.get(pageId)!.set(sectionId, plan);
  }

  get(pageId: string, sectionId: string): SectionPlan | undefined {
    return this.plans.get(pageId)?.get(sectionId);
  }

  deletePage(pageId: string): void {
    this.plans.delete(pageId);
  }
}

export const planStore = new PlanStore();
