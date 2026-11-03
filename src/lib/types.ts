/** One uploaded tab, ready to be scanned against. */
export interface Sheet {
  id: string
  name: string
  /** Where the sheet came from. Photo capture is planned for later. */
  source: 'excel'
  headers: string[]
  rows: string[][]
  /** Index of the column holding license plates, or null until chosen. */
  matchColumn: number | null
  /** Row index -> ISO time the row was first scanned. */
  found: Record<number, string>
}

export type ScanScope = { kind: 'all' } | { kind: 'sheet'; sheetId: string }

export interface ScanMatch {
  sheetId: string
  sheetName: string
  rowIndex: number
  headers: string[]
  row: string[]
  /** True if the row had already been scanned before this scan. */
  alreadyFound: boolean
  /** When the row was first scanned (now, for a new find). */
  foundAt: string
}

export type ScanResult =
  | { kind: 'empty' }
  | { kind: 'no-sheets' }
  | { kind: 'none'; value: string }
  | { kind: 'match'; value: string; matches: ScanMatch[] }
  | { kind: 'already'; value: string; matches: ScanMatch[] }

export interface UnmatchedScan {
  value: string
  scannedAt: string
  /** "All sheets" or the name of the sheet that was searched. */
  scope: string
}
