import type { GenerationSession, ViewerComponent, ComponentVariant } from "@avv/shared";

interface StoredGeneration {
  session: GenerationSession;
  figmaSuggested: boolean;
}

class GenerationStore {
  private generations = new Map<string, StoredGeneration>();

  save(wsSessionId: string, session: GenerationSession): void {
    this.generations.set(wsSessionId, { session, figmaSuggested: false });
  }

  get(wsSessionId: string): StoredGeneration | undefined {
    return this.generations.get(wsSessionId);
  }

  updateComponent(
    wsSessionId: string,
    genSessionId: string,
    componentId: string,
    updates: Partial<ViewerComponent>
  ): void {
    const stored = this.generations.get(wsSessionId);
    if (!stored || stored.session.id !== genSessionId) return;

    stored.session.components = stored.session.components.map((c) => {
      if (c.id !== componentId) return c;
      const merged = { ...c, ...updates };
      if (updates.variants) {
        merged.variants = [...c.variants, ...updates.variants];
      }
      return merged;
    });
  }

  updateComponentStatus(
    wsSessionId: string,
    genSessionId: string,
    componentId: string,
    status: ViewerComponent["status"]
  ): void {
    const stored = this.generations.get(wsSessionId);
    if (!stored || stored.session.id !== genSessionId) return;

    stored.session.components = stored.session.components.map((c) =>
      c.id === componentId ? { ...c, status } : c
    );
  }

  markFigmaSuggested(wsSessionId: string): void {
    const stored = this.generations.get(wsSessionId);
    if (stored) stored.figmaSuggested = true;
  }

  delete(wsSessionId: string): void {
    this.generations.delete(wsSessionId);
  }
}

export const generationStore = new GenerationStore();
