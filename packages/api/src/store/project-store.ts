import type { Project, Screen, LayoutOption } from "@avv/shared";
import type { DesignSystem, DesignTokens } from "@avv/shared";
import { compileTokensToCSS } from "@avv/shared";

class ProjectStore {
  private projects = new Map<string, Project>();
  /** Maps WS session ID → project ID */
  private sessionToProject = new Map<string, string>();

  create(wsSessionId: string, title: string): Project {
    const project: Project = {
      id: crypto.randomUUID(),
      title,
      designSystem: null,
      designSystemOptions: [],
      screens: [],
      createdAt: new Date().toISOString(),
    };
    this.projects.set(project.id, project);
    this.sessionToProject.set(wsSessionId, project.id);
    return project;
  }

  getBySession(wsSessionId: string): Project | undefined {
    const projectId = this.sessionToProject.get(wsSessionId);
    if (!projectId) return undefined;
    return this.projects.get(projectId);
  }

  get(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }

  setDesignSystemOptions(wsSessionId: string, options: DesignSystem[]): void {
    const project = this.getBySession(wsSessionId);
    if (!project) return;
    project.designSystemOptions = options;
  }

  selectDesignSystem(wsSessionId: string, designSystemId: string): DesignSystem | undefined {
    const project = this.getBySession(wsSessionId);
    if (!project) return undefined;
    const ds = project.designSystemOptions.find((o) => o.id === designSystemId);
    if (!ds) return undefined;
    project.designSystem = ds;
    return ds;
  }

  updateDesignSystemTokens(wsSessionId: string, tokenUpdates: Partial<DesignTokens>): DesignSystem | undefined {
    const project = this.getBySession(wsSessionId);
    if (!project?.designSystem) return undefined;

    const ds = project.designSystem;
    if (tokenUpdates.colors) ds.tokens.colors = { ...ds.tokens.colors, ...tokenUpdates.colors };
    if (tokenUpdates.typography) {
      ds.tokens.typography = {
        ...ds.tokens.typography,
        ...tokenUpdates.typography,
        fontFamily: { ...ds.tokens.typography.fontFamily, ...tokenUpdates.typography.fontFamily },
      };
    }
    if (tokenUpdates.spacing) ds.tokens.spacing = { ...ds.tokens.spacing, ...tokenUpdates.spacing };
    if (tokenUpdates.borderRadius) ds.tokens.borderRadius = { ...ds.tokens.borderRadius, ...tokenUpdates.borderRadius };
    if (tokenUpdates.shadows) ds.tokens.shadows = { ...ds.tokens.shadows, ...tokenUpdates.shadows };

    ds.css = compileTokensToCSS(ds.tokens);
    return ds;
  }

  addScreen(wsSessionId: string, screen: Screen): void {
    const project = this.getBySession(wsSessionId);
    if (!project) return;
    project.screens.push(screen);
  }

  getScreen(wsSessionId: string, screenId: string): Screen | undefined {
    const project = this.getBySession(wsSessionId);
    if (!project) return undefined;
    return project.screens.find((s) => s.id === screenId);
  }

  updateScreen(wsSessionId: string, screenId: string, updates: Partial<Screen>): void {
    const project = this.getBySession(wsSessionId);
    if (!project) return;
    project.screens = project.screens.map((s) =>
      s.id === screenId ? { ...s, ...updates } : s
    );
  }

  setLayoutOptions(wsSessionId: string, screenId: string, options: LayoutOption[]): void {
    const screen = this.getScreen(wsSessionId, screenId);
    if (!screen) return;
    screen.layoutOptions = options;
  }

  selectLayout(wsSessionId: string, screenId: string, layoutId: string): LayoutOption | undefined {
    const screen = this.getScreen(wsSessionId, screenId);
    if (!screen) return undefined;
    const layout = screen.layoutOptions.find((l) => l.id === layoutId);
    if (!layout) return undefined;
    screen.selectedLayoutId = layoutId;
    screen.components = layout.components;
    screen.status = "ready";
    return layout;
  }

  delete(wsSessionId: string): void {
    const projectId = this.sessionToProject.get(wsSessionId);
    if (projectId) {
      this.projects.delete(projectId);
      this.sessionToProject.delete(wsSessionId);
    }
  }
}

export const projectStore = new ProjectStore();
