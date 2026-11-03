import { useEffect, useId, useRef, useState } from 'react'
import { createFeedback, type Feedback } from '../lib/feedback'
import { getScanTargets } from '../lib/matcher'
import type { ScanMatch, ScanResult } from '../lib/types'
import { useApp } from '../state/context'
import ScanInput from './ScanInput'

const defaultFeedback = createFeedback()

interface Props {
  onBack: () => void
  /** Sound and vibration; tests pass a stand-in. */
  feedback?: Feedback
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function soundFor(result: ScanResult): 'match' | 'none' | 'already' | null {
  switch (result.kind) {
    case 'match':
      return 'match'
    case 'already':
      return 'already'
    case 'none':
    case 'no-sheets':
      return 'none'
    case 'empty':
      return null
  }
}

const TITLES: Record<ScanResult['kind'], string> = {
  match: 'Match',
  already: 'Already scanned',
  none: 'No match',
  'no-sheets': 'Nothing to scan',
  empty: '',
}

function MatchDetails({
  match,
  showEarlierBadge,
}: {
  match: ScanMatch
  showEarlierBadge: boolean
}) {
  return (
    <div className="match">
      <p className="match-sheet">{match.sheetName}</p>
      {match.alreadyFound && showEarlierBadge && (
        <p className="badge warn">Already scanned earlier</p>
      )}
      {match.alreadyFound && !showEarlierBadge && (
        <p className="muted">First scanned {formatTime(match.foundAt)}</p>
      )}
      <dl>
        {match.headers.map((header, col) => (
          <div key={col} className="detail">
            <dt>{header}</dt>
            <dd>{match.row[col] || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function ScanMode({
  onBack,
  feedback = defaultFeedback,
}: Props) {
  const { state, dispatch } = useApp()
  const [started, setStarted] = useState(false)
  const unmatchedTitleId = useId()

  const { active, skipped } = getScanTargets(state.sheets, state.scope)
  const found = active.reduce((n, s) => n + Object.keys(s.found).length, 0)
  const total = active.reduce((n, s) => n + s.rows.length, 0)

  // Play a sound whenever a new scan result appears (not for one that was
  // already on screen when this screen opened).
  const previous = useRef(state.lastScan)
  useEffect(() => {
    const result = state.lastScan
    if (result && result !== previous.current) {
      const sound = soundFor(result)
      if (sound) feedback.play(sound)
    }
    previous.current = result
  }, [state.lastScan, feedback])

  const result = state.lastScan
  const recentUnmatched = [...state.unmatched].reverse().slice(0, 50)

  return (
    <section>
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          Back
        </button>
        <h2>Scan</h2>
      </header>

      <div className="field">
        <label htmlFor="scan-scope">Search in</label>
        <select
          id="scan-scope"
          value={state.scope.kind === 'all' ? 'all' : state.scope.sheetId}
          onChange={(event) =>
            dispatch({
              type: 'set-scope',
              scope:
                event.target.value === 'all'
                  ? { kind: 'all' }
                  : { kind: 'sheet', sheetId: event.target.value },
            })
          }
        >
          <option value="all">All sheets</option>
          {state.sheets.map((sheet) => (
            <option key={sheet.id} value={sheet.id}>
              {sheet.name}
            </option>
          ))}
        </select>
      </div>

      <p className="counter">
        {found} of {total} found
      </p>

      {skipped.length > 0 && (
        <p className="notice warn">
          {skipped.length} {skipped.length === 1 ? 'sheet' : 'sheets'} skipped
          (no plate column set): {skipped.map((s) => s.name).join(', ')}
        </p>
      )}
      {active.length === 0 && (
        <p className="notice warn">
          No sheets are ready to scan. Set a plate column on each sheet first.
        </p>
      )}

      {started ? (
        <ScanInput
          onScan={(value) => dispatch({ type: 'scan', value, now: new Date() })}
        />
      ) : (
        <button
          type="button"
          className="primary big"
          onClick={() => {
            void feedback.unlock()
            setStarted(true)
          }}
        >
          Start scanning
        </button>
      )}

      {result && result.kind !== 'empty' && (
        <div
          role="status"
          aria-label="Scan result"
          data-kind={result.kind}
          className={`result ${result.kind}`}
        >
          <p className="result-title">{TITLES[result.kind]}</p>
          {'value' in result && <p className="result-value">{result.value}</p>}
          {result.kind === 'no-sheets' && (
            <p>Choose a plate column for the sheets you want to scan against.</p>
          )}
          {(result.kind === 'match' || result.kind === 'already') &&
            result.matches.map((match) => (
              <MatchDetails
                key={`${match.sheetId}-${match.rowIndex}`}
                match={match}
                showEarlierBadge={result.kind === 'match'}
              />
            ))}
        </div>
      )}

      {state.unmatched.length > 0 && (
        <section aria-labelledby={unmatchedTitleId} className="unmatched">
          <h3 id={unmatchedTitleId}>
            Unmatched scans ({state.unmatched.length})
          </h3>
          <ul>
            {recentUnmatched.map((entry, i) => (
              <li key={`${entry.scannedAt}-${i}`}>
                <span className="mono">{entry.value}</span>{' '}
                <span className="muted">
                  {formatTime(entry.scannedAt)} · {entry.scope}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
