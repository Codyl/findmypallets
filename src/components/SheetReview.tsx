import { useMemo, useRef, useState } from 'react'
import { sheetProgress } from '../lib/matcher'
import { checkPlateColumn } from '../lib/plate'
import { useApp } from '../state/context'

interface Props {
  sheetId: string
  onBack: () => void
}

function joinRows(rowIndexes: number[]): string {
  const numbers = rowIndexes.map((i) => String(i + 1))
  if (numbers.length <= 2) return numbers.join(' and ')
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

function CellEditor({
  label,
  initial,
  onCommit,
  onCancel,
}: {
  label: string
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const finished = useRef(false)

  const finish = (save: boolean) => {
    if (finished.current) return
    finished.current = true
    if (save) onCommit(draft)
    else onCancel()
  }

  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true)
        else if (event.key === 'Escape') finish(false)
      }}
    />
  )
}

export default function SheetReview({ sheetId, onBack }: Props) {
  const { state, dispatch } = useApp()
  const sheet = state.sheets.find((s) => s.id === sheetId)
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(
    null,
  )

  const checks = useMemo(
    () =>
      sheet && sheet.matchColumn !== null
        ? checkPlateColumn(sheet.rows, sheet.matchColumn)
        : null,
    [sheet],
  )

  if (!sheet) {
    return (
      <section>
        <button type="button" onClick={onBack}>
          Back
        </button>
        <p role="alert">Sheet not found.</p>
      </section>
    )
  }

  const { found, total } = sheetProgress(sheet)
  const duplicateRows = new Set(checks?.duplicates.flatMap((d) => d.rows))
  const hasIssues =
    checks !== null &&
    (checks.duplicates.length > 0 || checks.blankRows.length > 0)

  return (
    <section>
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          Back
        </button>
        <h2>{sheet.name}</h2>
        <span className="muted">
          {found} of {total} found
        </span>
      </header>

      <div className="field">
        <label htmlFor="plate-column">Plate column</label>
        <select
          id="plate-column"
          value={sheet.matchColumn === null ? '' : String(sheet.matchColumn)}
          onChange={(event) =>
            dispatch({
              type: 'set-match-column',
              id: sheet.id,
              column: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        >
          <option value="">Choose column…</option>
          {sheet.headers.map((header, index) => (
            <option key={index} value={index}>
              {header}
            </option>
          ))}
        </select>
        {sheet.matchColumn === null && (
          <p className="notice warn">
            Choose the plate column to enable scanning for this sheet.
          </p>
        )}
        {found > 0 && (
          <p className="muted">Changing the column clears found marks.</p>
        )}
      </div>

      {hasIssues && checks && (
        <div role="status" aria-label="Data checks" className="notice warn">
          <p>
            {checks.duplicates.length > 0 && (
              <span>
                {checks.duplicates.length} duplicate{' '}
                {checks.duplicates.length === 1 ? 'plate' : 'plates'}
              </span>
            )}
            {checks.duplicates.length > 0 && checks.blankRows.length > 0 && ' · '}
            {checks.blankRows.length > 0 && (
              <span>{checks.blankRows.length} blank</span>
            )}
          </p>
          <ul>
            {checks.duplicates.map((group) => (
              <li key={group.value}>
                {group.value} appears in rows {joinRows(group.rows)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              {sheet.headers.map((header, col) => (
                <th
                  key={col}
                  scope="col"
                  className={col === sheet.matchColumn ? 'plate-col' : undefined}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={duplicateRows.has(rowIndex) ? 'dup' : undefined}
              >
                <th scope="row">
                  {rowIndex + 1}
                  {sheet.found[rowIndex] !== undefined && (
                    <span aria-label="Found" className="found-mark">
                      ✓
                    </span>
                  )}
                </th>
                {sheet.headers.map((header, col) => {
                  const label = `Edit ${header}, row ${rowIndex + 1}`
                  const value = row[col] ?? ''
                  const isEditing =
                    editing?.row === rowIndex && editing.col === col
                  return (
                    <td
                      key={col}
                      className={col === sheet.matchColumn ? 'plate-col' : undefined}
                    >
                      {isEditing ? (
                        <CellEditor
                          label={label}
                          initial={value}
                          onCancel={() => setEditing(null)}
                          onCommit={(next) => {
                            if (next !== value) {
                              dispatch({
                                type: 'edit-cell',
                                id: sheet.id,
                                row: rowIndex,
                                col,
                                value: next,
                              })
                            }
                            setEditing(null)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="cell"
                          aria-label={label}
                          onClick={() => setEditing({ row: rowIndex, col })}
                        >
                          {value === '' ? <em className="muted">blank</em> : value}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
