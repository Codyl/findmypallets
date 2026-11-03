import { createStore, del, get, set } from 'idb-keyval'
import type { PersistedState } from '../state/reducer'
import type { ScanScope, Sheet, UnmatchedScan } from './types'

export interface Storage {
  load: () => Promise<PersistedState | null>
  save: (data: PersistedState) => Promise<void>
  clear: () => Promise<void>
}

const KEY = 'state'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

function parseSheet(value: unknown): Sheet | null {
  if (!isRecord(value)) return null
  const { id, name, headers, rows, matchColumn, found } = value
  if (typeof id !== 'string' || typeof name !== 'string') return null
  if (!isStringArray(headers)) return null
  if (!Array.isArray(rows) || !rows.every(isStringArray)) return null

  const validColumn =
    typeof matchColumn === 'number' &&
    Number.isInteger(matchColumn) &&
    matchColumn >= 0 &&
    matchColumn < headers.length

  const foundMarks: Record<number, string> = {}
  if (isRecord(found)) {
    for (const [key, time] of Object.entries(found)) {
      const row = Number(key)
      if (
        Number.isInteger(row) &&
        row >= 0 &&
        row < rows.length &&
        typeof time === 'string'
      ) {
        foundMarks[row] = time
      }
    }
  }

  return {
    id,
    name,
    source: 'excel',
    headers,
    rows,
    matchColumn: validColumn ? matchColumn : null,
    found: foundMarks,
  }
}

function parseUnmatched(value: unknown): UnmatchedScan | null {
  if (!isRecord(value)) return null
  const { value: scanned, scannedAt, scope } = value
  if (
    typeof scanned !== 'string' ||
    typeof scannedAt !== 'string' ||
    typeof scope !== 'string'
  ) {
    return null
  }
  return { value: scanned, scannedAt, scope }
}

function parseScope(value: unknown): ScanScope {
  if (isRecord(value) && value.kind === 'sheet' && typeof value.sheetId === 'string') {
    return { kind: 'sheet', sheetId: value.sheetId }
  }
  return { kind: 'all' }
}

/**
 * Checks saved data before it is used, dropping anything malformed so a bad
 * save can never crash the app. Returns null if nothing usable was saved.
 */
export function parsePersisted(value: unknown): PersistedState | null {
  if (!isRecord(value)) return null
  if (!Array.isArray(value.sheets) || !Array.isArray(value.unmatched)) return null

  return {
    sheets: value.sheets
      .map(parseSheet)
      .filter((sheet): sheet is Sheet => sheet !== null),
    unmatched: value.unmatched
      .map(parseUnmatched)
      .filter((entry): entry is UnmatchedScan => entry !== null),
    scope: parseScope(value.scope),
  }
}

/** Browser storage (IndexedDB), so a refresh or locked phone loses nothing. */
export function createIdbStorage(dbName = 'findmypallets'): Storage {
  const store = createStore(dbName, 'app')
  return {
    async load() {
      return parsePersisted(await get(KEY, store))
    },
    async save(data) {
      await set(KEY, data, store)
    },
    async clear() {
      await del(KEY, store)
    },
  }
}
