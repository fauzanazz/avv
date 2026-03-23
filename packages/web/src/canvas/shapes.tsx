import { BaseBoxShapeUtil, type TLBaseShape } from "tldraw";
import type { ComponentStatus } from "@avv/shared";

export const AVV_COMPONENT_TYPE = "avv-component" as const;

export interface AVVComponentProps {
  w: number;
  h: number;
  name: string;
  status: ComponentStatus;
  html: string;
  css: string;
  prompt: string;
  agentId: string;
  iteration: number;
}

export type AVVComponentShape = TLBaseShape<
  typeof AVV_COMPONENT_TYPE,
  AVVComponentProps
>;

export class AVVComponentShapeUtil extends BaseBoxShapeUtil<AVVComponentShape> {
  static override type = AVV_COMPONENT_TYPE;

  getDefaultProps(): AVVComponentProps {
    return {
      w: 400,
      h: 300,
      name: "Untitled",
      status: "pending",
      html: "",
      css: "",
      prompt: "",
      agentId: "",
      iteration: 0,
    };
  }

  component(shape: AVVComponentShape) {
    const { w, h, name, status, html, css } = shape.props;

    const statusColors: Record<ComponentStatus, string> = {
      pending: "#94a3b8",
      generating: "#3b82f6",
      ready: "#22c55e",
      error: "#ef4444",
    };

    if (status === "ready" && html) {
      const srcDoc = `<!DOCTYPE html><html><head><style>${css}</style></head><body>${html}</body></html>`;
      return (
        <div style={{ width: w, height: h, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: "4px 8px",
              background: statusColors[status],
              color: "white",
              fontSize: 11,
              fontWeight: 600,
              zIndex: 1,
            }}
          >
            {name}
          </div>
          <iframe
            srcDoc={srcDoc}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              pointerEvents: "none",
            }}
            sandbox="allow-scripts"
            title={name}
          />
        </div>
      );
    }

    return (
      <div
        style={{
          width: w,
          height: h,
          border: `2px solid ${statusColors[status]}`,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#1e293b",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: statusColors[status],
            textTransform: "capitalize",
          }}
        >
          {status === "generating" ? "Generating..." : status}
        </div>
      </div>
    );
  }

  indicator(shape: AVVComponentShape) {
    const { w, h } = shape.props;
    return <rect width={w} height={h} rx={8} />;
  }
}
