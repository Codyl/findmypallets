import { useState } from 'react'
import {
  downloadFile,
  exportFileName,
  sessionToXlsx,
  sheetToCsv,
  sheetToXlsx,
  type ExportFilter,
} from '../lib/export'
import { useApp } from '../state/context'

type Mode = { kind: 'sheet'; sheetId: string } | { kind: 'session' }

interface Props {
  mode: Mode
  /** Saves the file; tests pass a stand-in. */
  download?: (fileName: string, blob: Blob) => void
  now?: () => Date
}

const FILTER_LABELS: Record<ExportFilter, string> = {
  all: 'All rows',
  found: 'Found only',
  'not-found': 'Not found only',
}

const FILE_LABELS: Record<ExportFilter, string | undefined> = {
  all: undefined,
  found: 'found',
  'not-found': 'not found',
}

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default function ExportPanel({
  mode,
  download = downloadFile,
  now = () => new Date(),
}: Props) {
  const { state } = useApp()
  const [filter, setFilter] = useState<ExportFilter>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sheet =
    mode.kind === 'sheet'
      ? state.sheets.find((s) => s.id === mode.sheetId)
      : undefined
  if (mode.kind === 'sheet' && !sheet) return null

  const run = async (
    extension: 'csv' | 'xlsx',
    build: () => Promise<Blob> | Blob,
  ) => {
    setMessage(null)
    setError(null)
    try {
      const baseName = sheet ? sheet.name : 'findmypallets'
      const fileName = exportFileName(baseName, extension, now(), FILE_LABELS[filter])
      download(fileName, await build())
      setMessage(`Exported ${fileName}`)
    } catch {
      setError('Export failed. Please try again.')
    }
  }

  return (
    <details className="export-panel">
      <summary>Export</summary>
      <div className="field">
        <label htmlFor={`export-filter-${mode.kind}`}>Rows to include</label>
        <select
          id={`export-filter-${mode.kind}`}
          value={filter}
          onChange={(event) => setFilter(event.target.value as ExportFilter)}
        >
          {(Object.keys(FILTER_LABELS) as ExportFilter[]).map((key) => (
            <option key={key} value={key}>
              {FILTER_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar">
        {sheet ? (
          <>
            <button
              type="button"
              onClick={() =>
                run(
                  'csv',
                  () =>
                    new Blob([sheetToCsv(sheet, filter)], {
                      type: 'text/csv;charset=utf-8',
                    }),
                )
              }
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() =>
                run(
                  'xlsx',
                  async () =>
                    new Blob([(await sheetToXlsx(sheet, filter)) as BlobPart], {
                      type: XLSX_TYPE,
                    }),
                )
              }
            >
              Download Excel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              run(
                'xlsx',
                async () =>
                  new Blob(
                    [
                      (await sessionToXlsx(
                        state.sheets,
                        state.unmatched,
                        filter,
                      )) as BlobPart,
                    ],
                    { type: XLSX_TYPE },
                  ),
              )
            }
          >
            Download Excel (all sheets)
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  )
}
