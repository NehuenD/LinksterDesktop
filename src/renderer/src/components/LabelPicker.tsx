import { useState } from 'react'
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui-classes'

const NEW_LABEL_OPTION = '\u0000new-label'

export default function LabelPicker({
  value,
  labels,
  onChange
}: {
  value: string
  labels: string[]
  onChange: (value: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  const options = labels.includes(value) ? labels : [value, ...labels]

  const commit = () => {
    const name = draft.trim()
    if (name.length === 0) return
    onChange(name)
    setCreating(false)
    setDraft('')
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          placeholder="New label name"
          className={inputClass}
        />
        <button
          type="button"
          onClick={commit}
          disabled={draft.trim().length === 0}
          className={primaryButtonClass}
        >
          Use
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false)
            setDraft('')
          }}
          className={secondaryButtonClass}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(event) => {
        if (event.target.value === NEW_LABEL_OPTION) {
          setDraft('')
          setCreating(true)
          return
        }
        onChange(event.target.value)
      }}
      className={inputClass}
    >
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      <option value={NEW_LABEL_OPTION}>New label…</option>
    </select>
  )
}
