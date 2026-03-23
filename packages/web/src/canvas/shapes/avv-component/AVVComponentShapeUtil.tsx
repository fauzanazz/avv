import {
  ShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  T,
  type Geometry2d,
  type TLResizeInfo,
  type RecordProps,
} from "tldraw";
import {
  AVV_COMPONENT_TYPE,
  type AVVComponentShape,
  type AVVComponentProps,
} from "./avv-component-types";
import { ComponentPreview } from "./ComponentPreview";
import { ComponentStatusOverlay } from "./ComponentStatusOverlay";

export class AVVComponentShapeUtil extends ShapeUtil<AVVComponentShape> {
  static override type = AVV_COMPONENT_TYPE;

  static override props: RecordProps<AVVComponentShape> = {
    w: T.number,
    h: T.number,
    name: T.string,
    status: T.literalEnum("pending", "generating", "ready", "error"),
    html: T.string,
    css: T.string,
    prompt: T.string,
    agentId: T.string,
    iteration: T.number,
  };

  getDefaultProps(): AVVComponentProps {
    return {
      w: 400,
      h: 300,
      name: "Untitled Component",
      status: "pending",
      html: "",
      css: "",
      prompt: "",
      agentId: "",
      iteration: 0,
    };
  }

  override canEdit = () => false;
  override canResize = () => true;
  override isAspectRatioLocked = () => false;

  getGeometry(shape: AVVComponentShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize = (shape: AVVComponentShape, info: TLResizeInfo<AVVComponentShape>) => {
    return resizeBox(shape, info);
  };

  component(shape: AVVComponentShape) {
    const { w, h, name, status, html, css } = shape.props;

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          display: "flex",
          flexDirection: "column",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          pointerEvents: "all",
        }}
      >
        {/* Component label bar */}
        <div
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span>{name}</span>
          <ComponentStatusOverlay status={status} />
        </div>

        {/* HTML preview area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {status === "ready" && html ? (
            <ComponentPreview html={html} css={css} width={w} height={Math.max(0, h - 32)} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#94a3b8",
                fontSize: 14,
              }}
            >
              {status === "pending" && "Waiting..."}
              {status === "generating" && "Generating..."}
              {status === "error" && "Generation failed"}
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: AVVComponentShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
