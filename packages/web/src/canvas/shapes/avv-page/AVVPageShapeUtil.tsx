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
  AVV_PAGE_TYPE,
  type AVVPageShape,
  type AVVPageProps,
  parseSections,
} from "./avv-page-types";
import { PagePreview } from "./PagePreview";
import { PageStatusBar } from "./PageStatusBar";

export class AVVPageShapeUtil extends ShapeUtil<AVVPageShape> {
  static override type = AVV_PAGE_TYPE;

  static override props: RecordProps<AVVPageShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    status: T.literalEnum("pending", "generating", "ready", "error"),
    sectionsJson: T.string,
    prompt: T.string,
    mode: T.literalEnum("simple", "ultrathink"),
  };

  getDefaultProps(): AVVPageProps {
    return {
      w: 800,
      h: 600,
      title: "Untitled Page",
      status: "pending",
      sectionsJson: "[]",
      prompt: "",
      mode: "simple",
    };
  }

  override canEdit = () => false;
  override canResize = () => true;
  override isAspectRatioLocked = () => false;

  getGeometry(shape: AVVPageShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize = (shape: AVVPageShape, info: TLResizeInfo<AVVPageShape>) => {
    return resizeBox(shape, info);
  };

  component(shape: AVVPageShape) {
    const { w, h, title, sectionsJson } = shape.props;
    const sections = parseSections(sectionsJson);

    const allReady = sections.length > 0 && sections.every((s) => s.status === "ready");
    const anyGenerating = sections.some((s) => s.status === "generating");
    const readyCount = sections.filter((s) => s.status === "ready").length;

    // Stitch all ready sections into one HTML document
    const stitchedHtml = sections
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        if (s.status === "ready" && s.html) {
          return `<section data-section-id="${s.id}" data-section-name="${s.name}">${s.html}</section>`;
        }
        return `<section data-section-id="${s.id}" data-section-name="${s.name}" style="padding:40px;text-align:center;color:#94a3b8;font-family:system-ui;background:#f8fafc;border-bottom:1px dashed #e2e8f0;">
          <div style="font-size:14px">${s.status === "generating" ? "Generating..." : s.status === "error" ? "Failed" : "Pending..."} -- ${s.name}</div>
        </section>`;
      })
      .join("\n");

    const stitchedCss = sections
      .filter((s) => s.css)
      .map((s) => s.css)
      .join("\n");

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          display: "flex",
          flexDirection: "column",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          pointerEvents: "all",
        }}
      >
        {/* Page title bar */}
        <PageStatusBar
          title={title}
          readyCount={readyCount}
          totalCount={sections.length}
          isGenerating={anyGenerating}
          isAllReady={allReady}
        />

        {/* Stitched page preview */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {sections.length > 0 ? (
            <PagePreview html={stitchedHtml} css={stitchedCss} width={w} height={h - 36} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#94a3b8",
                fontSize: 14,
                fontFamily: "system-ui",
              }}
            >
              Waiting for generation...
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: AVVPageShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
