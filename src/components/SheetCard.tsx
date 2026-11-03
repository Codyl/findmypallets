import { sheetProgress } from '../lib/matcher'
import type { Sheet } from '../lib/types'

interface Props {
  sheet: Sheet
  onReview: () => void
  onReset: () => void
  onDelete: () => void
}

export default function SheetCard({ sheet, onReview, onReset, onDelete }: Props) {
  const { found, total } = sheetProgress(sheet)
  return (
    <li className="card">
      <div className="card-main">
        <strong className="card-title">{sheet.name}</strong>
        <span className="muted">
          {found} of {total} found
        </span>
        {sheet.matchColumn === null && (
          <span className="badge warn">No plate column set</span>
        )}
      </div>
      <div className="card-actions">
        <button type="button" onClick={onReview} aria-label={`Review ${sheet.name}`}>
          Review
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={found === 0}
          aria-label={`Reset progress for ${sheet.name}`}
        >
          Reset
        </button>
        <button
          type="button"
          className="danger"
          onClick={onDelete}
          aria-label={`Delete ${sheet.name}`}
        >
          Delete
        </button>
      </div>
    </li>
  )
}
