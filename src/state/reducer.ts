import { applyScan } from '../lib/matcher'
import type { ScanResult, ScanScope, Sheet, UnmatchedScan } from '../lib/types'

export interface AppState {
  sheets: Sheet[]
  unmatched: UnmatchedScan[]
  scope: ScanScope
  /** The most recent scan outcome, shown on screen. Never saved. */
  lastScan: ScanResult | null
}

/** The part of the state that is saved in the browser. */
export interface PersistedState {
  sheets: Sheet[]
  unmatched: UnmatchedScan[]
  scope: ScanScope
}

export type Action =
  | { type: 'add-sheets'; sheets: Sheet[] }
  | { type: 'delete-sheet'; id: string }
  | {
      type: 'restore-sheet'
      sheet: Sheet
      index: number
      unmatched: UnmatchedScan[]
    }
  | { type: 'set-match-column'; id: string; column: number | null }
  | { type: 'edit-cell'; id: string; row: number; col: number; value: string }
  | { type: 'scan'; value: string; now: Date }
  | { type: 'set-scope'; scope: ScanScope }
  | { type: 'clear-last-scan' }
  | { type: 'reset-progress'; id: string }
  | { type: 'clear-unmatched' }
  | { type: 'clear-all' }
  | { type: 'load'; data: PersistedState }

export const initialState: AppState = {
  sheets: [],
  unmatched: [],
  scope: { kind: 'all' },
  lastScan: null,
}

function updateSheet(
  state: AppState,
  id: string,
  change: (sheet: Sheet) => Sheet,
): AppState {
  return {
    ...state,
    sheets: state.sheets.map((sheet) => (sheet.id === id ? change(sheet) : sheet)),
  }
}

function validScope(scope: ScanScope, sheets: Sheet[]): ScanScope {
  if (scope.kind === 'sheet' && !sheets.some((s) => s.id === scope.sheetId)) {
    return { kind: 'all' }
  }
  return scope
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'add-sheets':
      return { ...state, sheets: [...state.sheets, ...action.sheets] }

    case 'delete-sheet': {
      const doomed = state.sheets.find((s) => s.id === action.id)
      if (!doomed) return state
      const sheets = state.sheets.filter((s) => s.id !== action.id)
      return {
        ...state,
        sheets,
        unmatched: state.unmatched.filter((u) => u.scope !== doomed.name),
        scope: validScope(state.scope, sheets),
        lastScan: null,
      }
    }

    case 'restore-sheet': {
      const sheets = [...state.sheets]
      sheets.splice(Math.min(action.index, sheets.length), 0, action.sheet)
      return {
        ...state,
        sheets,
        unmatched: [...state.unmatched, ...action.unmatched],
      }
    }

    case 'set-match-column':
      return updateSheet(state, action.id, (sheet) =>
        sheet.matchColumn === action.column
          ? sheet
          : { ...sheet, matchColumn: action.column, found: {} },
      )

    case 'edit-cell': {
      const sheet = state.sheets.find((s) => s.id === action.id)
      const row = sheet?.rows[action.row]
      if (!sheet || !row || action.col < 0 || action.col >= row.length) {
        return state
      }
      return updateSheet(state, action.id, (current) => ({
        ...current,
        rows: current.rows.map((r, i) =>
          i === action.row
            ? r.map((cell, c) => (c === action.col ? action.value : cell))
            : r,
        ),
      }))
    }

    case 'scan': {
      const out = applyScan(
        state.sheets,
        state.unmatched,
        action.value,
        state.scope,
        action.now,
      )
      return {
        ...state,
        sheets: out.sheets,
        unmatched: out.unmatched,
        lastScan: out.result,
      }
    }

    case 'set-scope':
      return { ...state, scope: action.scope, lastScan: null }

    case 'clear-last-scan':
      return { ...state, lastScan: null }

    case 'reset-progress':
      return {
        ...updateSheet(state, action.id, (sheet) => ({ ...sheet, found: {} })),
        lastScan: null,
      }

    case 'clear-unmatched':
      return { ...state, unmatched: [] }

    case 'clear-all':
      return initialState

    case 'load':
      return {
        sheets: action.data.sheets,
        unmatched: action.data.unmatched,
        scope: validScope(action.data.scope, action.data.sheets),
        lastScan: null,
      }
  }
}
