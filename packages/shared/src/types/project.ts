import type { ComponentStatus } from "./canvas";
import type { ViewerComponent } from "./canvas";
import type { DesignSystem } from "./design-system";

export interface LayoutOption {
  id: string;
  label: string;
  components: ViewerComponent[];
  previewHtml: string;
}

export interface Screen {
  id: string;
  name: string;
  status: ComponentStatus;
  components: ViewerComponent[];
  layoutOptions: LayoutOption[];
  selectedLayoutId: string | null;
  prompt: string;
}

export interface Project {
  id: string;
  title: string;
  designSystem: DesignSystem | null;
  designSystemOptions: DesignSystem[];
  screens: Screen[];
  createdAt: string;
}
