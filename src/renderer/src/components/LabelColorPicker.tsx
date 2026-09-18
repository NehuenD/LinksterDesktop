import { autoColor, LABEL_COLOR_NAMES, LABEL_PALETTE } from '@shared/lib/label-color'

interface LabelColorPickerProps {
  /** Label name shown in the preview and used to compute the default color. */
  label: string
  selected: string | null
  onSelect: (color: string | null) => void
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5 text-white [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.65))]"
    >
      <path
        d="M20 6 9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function LabelColorPicker({ label, selected, onSelect }: LabelColorPickerProps) {
  const fallback = autoColor(label)
  const resolved = selected ?? fallback
  const previewText = label.trim() || 'Label'
  const isPaletteColor =
    selected !== null && LABEL_PALETTE.some((color) => color.toLowerCase() === selected.toLowerCase())
  const isCustom = selected !== null && !isPaletteColor
  const customValue = (isCustom ? selected : fallback).toLowerCase()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-md border border-subtle bg-raised px-3 py-2">
        <span
          className="inline-flex max-w-40 items-center truncate rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: resolved }}
        >
          {previewText}
        </span>
        <span className="ml-auto font-mono text-xs uppercase text-muted">{resolved}</span>
        {selected !== null ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-muted transition hover:text-primary"
          >
            Reset
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LABEL_PALETTE.map((color) => {
          const active = selected !== null && selected.toLowerCase() === color.toLowerCase()
          const colorName = LABEL_COLOR_NAMES[color] ?? color
          return (
            <button
              key={color}
              type="button"
              title={colorName}
              aria-label={colorName}
              aria-pressed={active}
              onClick={() => onSelect(color)}
              className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
                active ? 'border-primary ring-2 ring-accent' : 'border-subtle hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
            >
              {active ? <CheckIcon /> : null}
            </button>
          )
        })}

        <label
          title="Custom color"
          className={`relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition ${
            isCustom ? 'border-primary ring-2 ring-accent' : 'border-subtle hover:scale-110'
          }`}
          style={{
            background: isCustom
              ? selected
              : 'conic-gradient(from 0deg, #ef4444, #f59e0b, #84cc16, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)'
          }}
        >
          <input
            type="color"
            value={customValue}
            aria-label="Custom label color"
            onChange={(event) => onSelect(event.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          {isCustom ? <CheckIcon /> : null}
        </label>
      </div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition ${
          selected === null
            ? 'border-accent text-primary'
            : 'border-subtle text-muted hover:bg-hover hover:text-primary'
        }`}
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: fallback }}
        />
        <span className="font-medium">Default</span>
        <span>based on the label name</span>
        <span className="ml-auto font-mono uppercase text-muted">{fallback}</span>
      </button>
    </div>
  )
}
