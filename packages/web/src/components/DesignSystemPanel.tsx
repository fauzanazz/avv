import { useState, useCallback } from "react";
import type { DesignSystem, DesignTokens, ClientMessage } from "@avv/shared";

interface DesignSystemPanelProps {
  designSystem: DesignSystem;
  onSend: (msg: ClientMessage) => void;
}

function ColorInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-6 h-6 rounded border border-stone-200 cursor-pointer p-0"
      />
      <span className="text-[10px] font-[Public_Sans] text-stone-600 flex-1 truncate">
        {name}
      </span>
      <span className="text-[9px] font-mono text-stone-400">{value}</span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h4 className="text-[9px] font-[Public_Sans] font-bold text-stone-400 uppercase tracking-widest mt-4 mb-2 first:mt-0">
      {label}
    </h4>
  );
}

export function DesignSystemPanel({ designSystem, onSend }: DesignSystemPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const { tokens } = designSystem;

  const updateToken = useCallback(
    (category: keyof DesignTokens, key: string, value: string) => {
      if (category === "colors") {
        onSend({ type: "update:designsystem", tokens: { colors: { [key]: value } } });
      } else if (category === "spacing") {
        onSend({ type: "update:designsystem", tokens: { spacing: { [key]: value } } });
      } else if (category === "borderRadius") {
        onSend({ type: "update:designsystem", tokens: { borderRadius: { [key]: value } } });
      }
    },
    [onSend]
  );

  const handleRegenerateDS = useCallback(() => {
    onSend({ type: "regenerate:designsystem" });
  }, [onSend]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed right-4 top-16 z-40 bg-white border border-stone-200 rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow"
        title="Open design system panel"
      >
        <span className="material-symbols-outlined text-sm text-amber-700">palette</span>
      </button>
    );
  }

  return (
    <div className="w-56 bg-white border-l border-stone-100 flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-3 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs text-amber-700">palette</span>
          <h3 className="text-[11px] font-[Public_Sans] font-bold text-stone-800">
            {designSystem.label}
          </h3>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleRegenerateDS}
            className="p-1 rounded text-stone-400 hover:text-amber-700 transition-colors"
            title="Generate new options"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="p-1 rounded text-stone-400 hover:text-stone-700 transition-colors"
            title="Close panel"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <SectionHeader label="Colors" />
        <div className="space-y-1.5">
          {Object.entries(tokens.colors).map(([name, value]) => (
            <ColorInput
              key={name}
              name={name}
              value={value}
              onChange={(n, v) => updateToken("colors", n, v)}
            />
          ))}
        </div>

        <SectionHeader label="Typography" />
        <div className="space-y-1">
          <div className="text-[10px] font-[Public_Sans] text-stone-500">
            <span className="text-stone-400">Heading:</span>{" "}
            {tokens.typography.fontFamily.heading.split(",")[0].replace(/'/g, "")}
          </div>
          <div className="text-[10px] font-[Public_Sans] text-stone-500">
            <span className="text-stone-400">Body:</span>{" "}
            {tokens.typography.fontFamily.body.split(",")[0].replace(/'/g, "")}
          </div>
        </div>

        <SectionHeader label="Spacing" />
        <div className="grid grid-cols-3 gap-1">
          {Object.entries(tokens.spacing).map(([name, value]) => (
            <div
              key={name}
              className="text-center p-1 bg-stone-50 rounded text-[9px] font-mono text-stone-500"
              title={value}
            >
              {name}
            </div>
          ))}
        </div>

        <SectionHeader label="Border Radius" />
        <div className="flex gap-2 flex-wrap">
          {Object.entries(tokens.borderRadius).map(([name, value]) => (
            <div
              key={name}
              className="w-8 h-8 border border-stone-200 bg-stone-100 flex items-center justify-center text-[8px] font-mono text-stone-400"
              style={{ borderRadius: value }}
              title={`${name}: ${value}`}
            >
              {name}
            </div>
          ))}
        </div>

        <SectionHeader label="Shadows" />
        <div className="space-y-1.5">
          {Object.entries(tokens.shadows).map(([name, value]) => (
            <div
              key={name}
              className="bg-white rounded p-2 text-[9px] font-mono text-stone-400"
              style={{ boxShadow: value }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
