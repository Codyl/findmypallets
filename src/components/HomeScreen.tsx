import { useState, type ChangeEvent } from 'react'
import { createSheet } from '../lib/matcher'
import { newId } from '../lib/id'
import {
  parseSpreadsheet,
  SpreadsheetError,
  type ParsedTab,
} from '../lib/parseSpreadsheet'
import { useApp } from '../state/context'
import SheetCard from './SheetCard'
import TabPicker from './TabPicker'

interface Props {
  onOpenSheet: (sheetId: string) => void
  onStartScan: () => void
}

export default function HomeScreen({ onOpenSheet, onStartScan }: Props) {
  const { state, dispatch } = useApp()
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
            />
          ))}
        </ul>
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
