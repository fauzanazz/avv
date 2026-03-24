import { useEffect, useState } from "react";
import type { Editor } from "tldraw";
import type { PageSection } from "@avv/shared";
import { AVV_PAGE_TYPE, type AVVPageProps, parseSections } from "../canvas/shapes";

interface PropertiesPanelProps {
  editor: Editor | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function PropertiesPanel({ editor, isOpen, onToggle }: PropertiesPanelProps) {
  const [props, setProps] = useState<AVVPageProps | null>(null);
  const [sections, setSections] = useState<PageSection[]>([]);
  const [showHtml, setShowHtml] = useState(false);

  useEffect(() => {
    if (!editor) {
      setProps(null);
      setSections([]);
      return;
    }

    const updateProps = () => {
      const selected = editor.getSelectedShapes();
      const avvShape = selected.find((s) => s.type === AVV_PAGE_TYPE);
      if (avvShape) {
        const p = avvShape.props as AVVPageProps;
        setProps(p);
        setSections(parseSections(p.sectionsJson).sort((a, b) => a.order - b.order));
      } else {
        setProps(null);
        setSections([]);
      }
    };

    editor.on("change", updateProps);
    updateProps();

    return () => {
      editor.off("change", updateProps);
    };
  }, [editor]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-2 top-2 z-40 px-2 py-1 bg-white rounded-md shadow border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
      >
        Properties
      </button>
    );
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 bg-white border-l border-slate-200 z-40 flex flex-col shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-600">Properties</span>
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 text-sm">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!props ? (
          <p className="text-xs text-slate-400">Select a page to view properties</p>
        ) : (
          <div className="space-y-3">
            <PropRow label="Title" value={props.title} />
            <PropRow label="Status" value={props.status} />
            <PropRow label="Dimensions" value={`${props.w} x ${props.h}`} />
            <PropRow label="Mode" value={props.mode} />
            <PropRow label="Sections" value={`${sections.length}`} />

            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Prompt</p>
              <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 whitespace-pre-wrap">
                {props.prompt || "--"}
              </p>
            </div>

            {sections.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Sections</p>
                <div className="space-y-1">
                  {sections.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1">
                      <span className="text-slate-600 truncate">{s.name}</span>
                      <span className={`font-medium ${s.status === "ready" ? "text-green-600" : s.status === "error" ? "text-red-600" : "text-slate-400"}`}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button
                onClick={() => setShowHtml(!showHtml)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showHtml ? "Hide" : "Show"} Section HTML/CSS
              </button>

              {showHtml && sections.filter((s) => s.html || s.css).map((s) => (
                <div key={s.id} className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-slate-500">{s.name}</p>
                  {s.html && (
                    <>
                      <p className="text-[10px] font-medium text-slate-400 uppercase">HTML</p>
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                        {s.html}
                      </pre>
                    </>
                  )}
                  {s.css && (
                    <>
                      <p className="text-[10px] font-medium text-slate-400 uppercase">CSS</p>
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                        {s.css}
                      </pre>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-700">{value}</span>
    </div>
  );
}
