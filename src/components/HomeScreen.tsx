import { useCallback, useState, type ChangeEvent } from 'react'
import {
  downloadFile,
  exportFileName,
  sessionToXlsx,
  sheetToXlsx,
  XLSX_MIME,
} from '../lib/export'
import { createSheet } from '../lib/matcher'
import { newId } from '../lib/id'
import {
  parseSpreadsheet,
  SpreadsheetError,
  type ParsedTab,
} from '../lib/parseSpreadsheet'
import type { Sheet, UnmatchedScan } from '../lib/types'
import { useApp } from '../state/context'
import ConfirmDialog from './ConfirmDialog'
import ExportPanel from './ExportPanel'
import SheetCard from './SheetCard'
import TabPicker from './TabPicker'
import UndoToast from './UndoToast'

interface Props {
  onOpenSheet: (sheetId: string) => void
  onStartScan: () => void
  /** Saves a file; tests pass a stand-in. */
  download?: (fileName: string, blob: Blob) => void
}

type Confirm =
  | { kind: 'delete'; sheetId: string }
  | { kind: 'reset'; sheetId: string }
  | { kind: 'clear-all' }

interface Undo {
  sheet: Sheet
  index: number
  unmatched: UnmatchedScan[]
}

export default function HomeScreen({
  onOpenSheet,
  onStartScan,
  download = downloadFile,
}: Props) {
  const { state, dispatch } = useApp()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [undo, setUndo] = useState<Undo | null>(null)
  const [pendingTabs, setPendingTabs] = useState<ParsedTab[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const addTabs = (tabs: ParsedTab[]) => {
    dispatch({
      type: 'add-sheets',
      sheets: tabs.map((tab) => createSheet(tab, newId())),
    })
    setPendingTabs(null)
  }

  const closeConfirm = useCallback(() => {
    setConfirm(null)
    setConfirmError(null)
  }, [])

  const confirmSheet =
    confirm && confirm.kind !== 'clear-all'
      ? state.sheets.find((sheet) => sheet.id === confirm.sheetId)
      : undefined

  const exportFirst = async () => {
    setConfirmError(null)
    try {
      const now = new Date()
      if (confirm?.kind === 'clear-all') {
        const bytes = await sessionToXlsx(state.sheets, state.unmatched, 'all')
        download(
          exportFileName('findmypallets', 'xlsx', now),
          new Blob([bytes as BlobPart], { type: XLSX_MIME }),
        )
      } else if (confirmSheet) {
        const bytes = await sheetToXlsx(confirmSheet, 'all')
        download(
          exportFileName(confirmSheet.name, 'xlsx', now),
          new Blob([bytes as BlobPart], { type: XLSX_MIME }),
        )
      }
    } catch {
      setConfirmError('Export failed. Please try again.')
    }
  }

  const runConfirmed = () => {
    if (!confirm) return
    if (confirm.kind === 'delete' && confirmSheet) {
      setUndo({
        sheet: confirmSheet,
        index: state.sheets.findIndex((s) => s.id === confirmSheet.id),
        unmatched: state.unmatched.filter((u) => u.scope === confirmSheet.name),
      })
      dispatch({ type: 'delete-sheet', id: confirmSheet.id })
    } else if (confirm.kind === 'reset' && confirmSheet) {
      dispatch({ type: 'reset-progress', id: confirmSheet.id })
    } else if (confirm.kind === 'clear-all') {
      dispatch({ type: 'clear-all' })
      setUndo(null)
    }
    closeConfirm()
  }

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const tabs = await parseSpreadsheet(file)
      if (tabs.length === 1) addTabs(tabs)
      else setPendingTabs(tabs)
    } catch (err) {
      setError(
        err instanceof SpreadsheetError
          ? err.message
          : 'Something went wrong reading that file.',
      )
    } finally {
      setBusy(false)
      input.value = ''
    }
  }

  return (
    <section>
      <header className="screen-header">
        <h1>findmypallets</h1>
        <p className="muted">
          Upload your spreadsheets, then scan license plates to check them off.
        </p>
      </header>

      <div className="toolbar">
        <label className="button primary file-button">
          Add from Excel or CSV
          <input
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt"
            onChange={onFileChosen}
            className="visually-hidden"
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={state.sheets.length === 0}
          onClick={onStartScan}
        >
          Start scanning
        </button>
      </div>

      {busy && <p role="status">Reading file…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {state.sheets.length === 0 ? (
        <p className="muted empty">No sheets yet. Add a spreadsheet to begin.</p>
      ) : (
        <ul className="card-list">
          {state.sheets.map((sheet) => (
            <SheetCard
              key={sheet.id}
              sheet={sheet}
              onReview={() => onOpenSheet(sheet.id)}
              onReset={() => setConfirm({ kind: 'reset', sheetId: sheet.id })}
              onDelete={() => setConfirm({ kind: 'delete', sheetId: sheet.id })}
            />
          ))}
        </ul>
      )}

      {state.sheets.length > 0 && (
        <>
          <ExportPanel mode={{ kind: 'session' }} />
          <button
            type="button"
            className="danger"
            onClick={() => setConfirm({ kind: 'clear-all' })}
          >
            Clear all sheets
          </button>
        </>
      )}

      {undo && (
        <UndoToast
          key={undo.sheet.id}
          message={`Deleted ${undo.sheet.name}`}
          onUndo={() => {
            dispatch({
              type: 'restore-sheet',
              sheet: undo.sheet,
              index: undo.index,
              unmatched: undo.unmatched,
            })
            setUndo(null)
          }}
          onExpire={() => setUndo(null)}
        />
      )}

      {confirm?.kind === 'delete' && confirmSheet && (
        <ConfirmDialog
          title={`Delete ${confirmSheet.name}?`}
          message="This removes the sheet and its scan progress. You can undo for a few seconds."
          confirmLabel="Delete"
          secondary={{ label: 'Export first', onClick: exportFirst }}
          error={confirmError}
          onConfirm={runConfirmed}
          onCancel={closeConfirm}
        />
      )}
      {confirm?.kind === 'reset' && confirmSheet && (
        <ConfirmDialog
          title={`Reset progress for ${confirmSheet.name}?`}
          message="All found marks are cleared. The sheet itself is kept."
          confirmLabel="Reset"
          onConfirm={runConfirmed}
          onCancel={closeConfirm}
        />
      )}
      {confirm?.kind === 'clear-all' && (
        <ConfirmDialog
          title="Clear all sheets?"
          message="This removes every sheet, all progress and the unmatched scans from this browser. It cannot be undone."
          confirmLabel="Clear all"
          secondary={{ label: 'Export first', onClick: exportFirst }}
          error={confirmError}
          onConfirm={runConfirmed}
          onCancel={closeConfirm}
        />
      )}

      {pendingTabs && (
        <TabPicker
          tabs={pendingTabs}
          onConfirm={addTabs}
          onCancel={() => setPendingTabs(null)}
        />
      )}
    </section>
  )
}
