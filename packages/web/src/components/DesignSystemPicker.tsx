import type { DesignSystem, ClientMessage } from "@avv/shared";

interface DesignSystemPickerProps {
  options: DesignSystem[];
  onSend: (msg: ClientMessage) => void;
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-5 h-5 rounded-md border border-stone-200 shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-[Public_Sans] text-stone-500 truncate">{label}</span>
    </div>
  );
}

function DesignSystemCard({
  ds,
  onSelect,
}: {
  ds: DesignSystem;
  onSelect: () => void;
}) {
  const { colors, typography } = ds.tokens;

  return (
    <button
      onClick={onSelect}
      className="bg-white rounded-xl border border-stone-200 p-5 text-left hover:border-amber-400 hover:shadow-lg hover:shadow-amber-100/50 transition-all group"
    >
      <h3 className="text-sm font-[Public_Sans] font-bold text-stone-800 mb-3 group-hover:text-amber-800">
        {ds.label}
      </h3>

      {/* Color palette */}
      <div className="flex gap-1 mb-4">
        {Object.entries(colors).slice(0, 7).map(([name, value]) => (
          <div
            key={name}
            className="h-8 flex-1 first:rounded-l-lg last:rounded-r-lg"
            style={{ backgroundColor: value }}
            title={name}
          />
        ))}
      </div>

      {/* Typography preview */}
      <div className="mb-4 p-3 bg-stone-50 rounded-lg">
        <p
          className="text-lg font-bold text-stone-800 mb-1"
          style={{ fontFamily: typography.fontFamily.heading }}
        >
          Heading Preview
        </p>
        <p
          className="text-xs text-stone-500"
          style={{ fontFamily: typography.fontFamily.body }}
        >
          Body text preview — the quick brown fox jumps over the lazy dog.
        </p>
      </div>

      {/* Token details */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(colors).slice(0, 4).map(([name, value]) => (
          <ColorSwatch key={name} color={value} label={name} />
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2">
        <span className="text-[10px] font-[Public_Sans] text-stone-400">
          {typography.fontFamily.heading.split(",")[0].replace(/'/g, "")}
        </span>
        <span className="text-stone-300">/</span>
        <span className="text-[10px] font-[Public_Sans] text-stone-400">
          {typography.fontFamily.body.split(",")[0].replace(/'/g, "")}
        </span>
      </div>
    </button>
  );
}

export function DesignSystemPicker({ options, onSend }: DesignSystemPickerProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-stone-50 overflow-auto">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <span className="material-symbols-outlined text-3xl text-amber-600 mb-2 block">palette</span>
          <h2 className="text-xl font-[Noto_Serif] font-bold italic text-stone-800">
            Choose a Design System
          </h2>
          <p className="text-sm text-stone-500 font-[Public_Sans] mt-1">
            Select a visual direction for your project. You can change this anytime.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {options.map((ds) => (
            <DesignSystemCard
              key={ds.id}
              ds={ds}
              onSelect={() => onSend({ type: "select:designsystem", designSystemId: ds.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
