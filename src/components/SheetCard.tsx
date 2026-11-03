import { sheetProgress } from '../lib/matcher'
import type { Sheet } from '../lib/types'

interface Props {
  sheet: Sheet
  onReview: () => void
}

export default function SheetCard({ sheet, onReview }: Props) {
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
      </div>
    </li>
  )
}
