import { useId, useState } from 'react'
import type { ParsedTab } from '../lib/parseSpreadsheet'

interface Props {
  tabs: ParsedTab[]
  onConfirm: (chosen: ParsedTab[]) => void
  onCancel: () => void
}

/** Lets the user choose which tabs of a workbook become sheets. */
export default function TabPicker({ tabs, onConfirm, onCancel }: Props) {
  const titleId = useId()
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(tabs.map((_, i) => i)),
  )

  const toggle = (index: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const count = selected.size
  const addLabel =
    count === 0 ? 'Add sheets' : `Add ${count} ${count === 1 ? 'sheet' : 'sheets'}`

  return (
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal">
        <h2 id={titleId}>Choose tabs to add</h2>
        <ul className="tab-list">
          {tabs.map((tab, index) => {
            const inputId = `${titleId}-tab-${index}`
            const noteId = `${inputId}-note`
            return (
              <li key={index}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={selected.has(index)}
                  onChange={() => toggle(index)}
                  aria-describedby={noteId}
                />
                <label htmlFor={inputId}>{tab.name}</label>
                <span id={noteId} className="muted">
                  {tab.rows.length} {tab.rows.length === 1 ? 'row' : 'rows'}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={count === 0}
            onClick={() => onConfirm(tabs.filter((_, i) => selected.has(i)))}
          >
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
