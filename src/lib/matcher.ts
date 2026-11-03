import type { ParsedTab } from './parseSpreadsheet'
import { detectPlateColumn } from './plate'
import type {
  ScanMatch,
  ScanResult,
  ScanScope,
  Sheet,
  UnmatchedScan,
} from './types'

/** Builds a sheet from a parsed tab, auto-selecting the plate column if clear. */
export function createSheet(tab: ParsedTab, id: string): Sheet {
  const detected = detectPlateColumn(tab.headers)
  return {
    id,
    name: tab.name,
    source: 'excel',
    headers: tab.headers,
    rows: tab.rows,
    matchColumn: detected.status === 'found' ? detected.index : null,
    found: {},
  }
}

export function sheetProgress(sheet: Sheet): { found: number; total: number } {
  return { found: Object.keys(sheet.found).length, total: sheet.rows.length }
}

/**
 * Which sheets a scan will search. `skipped` lists in-scope sheets that have
 * no match column yet, so the UI can warn about them.
 */
export function getScanTargets(
  sheets: Sheet[],
  scope: ScanScope,
): { active: Sheet[]; skipped: Sheet[] } {
  const inScope =
    scope.kind === 'all'
      ? sheets
      : sheets.filter((sheet) => sheet.id === scope.sheetId)
  return {
    active: inScope.filter((sheet) => sheet.matchColumn !== null),
    skipped: inScope.filter((sheet) => sheet.matchColumn === null),
  }
}

function scopeLabel(sheets: Sheet[], scope: ScanScope): string {
  if (scope.kind === 'all') return 'All sheets'
  return sheets.find((sheet) => sheet.id === scope.sheetId)?.name ?? 'Sheet'
}

/**
 * Looks a scanned value up (exact match after trimming) and returns the
 * updated sheets and unmatched log along with what happened. Inputs are never
 * mutated.
 */
export function applyScan(
  sheets: Sheet[],
  unmatched: UnmatchedScan[],
  rawValue: string,
  scope: ScanScope,
  now: Date,
): { sheets: Sheet[]; unmatched: UnmatchedScan[]; result: ScanResult } {
  const value = rawValue.trim()
  if (value === '') {
    return { sheets, unmatched, result: { kind: 'empty' } }
  }

  const { active } = getScanTargets(sheets, scope)
  if (active.length === 0) {
    return { sheets, unmatched, result: { kind: 'no-sheets' } }
  }

  const stamp = now.toISOString()
  const matches: ScanMatch[] = []
  const updatedById = new Map<string, Sheet>()

  for (const sheet of active) {
    const column = sheet.matchColumn as number
    let found = sheet.found
    sheet.rows.forEach((row, rowIndex) => {
      if ((row[column] ?? '').trim() !== value) return
      const earlier = sheet.found[rowIndex]
      matches.push({
        sheetId: sheet.id,
        sheetName: sheet.name,
        rowIndex,
        headers: sheet.headers,
        row,
        alreadyFound: earlier !== undefined,
        foundAt: earlier ?? stamp,
      })
      if (earlier === undefined) {
        if (found === sheet.found) found = { ...sheet.found }
        found[rowIndex] = stamp
      }
    })
    if (found !== sheet.found) updatedById.set(sheet.id, { ...sheet, found })
  }

  if (matches.length === 0) {
    return {
      sheets,
      unmatched: [
        ...unmatched,
        { value, scannedAt: stamp, scope: scopeLabel(sheets, scope) },
      ],
      result: { kind: 'none', value },
    }
  }

  const nextSheets = sheets.map((sheet) => updatedById.get(sheet.id) ?? sheet)
  const anyNew = matches.some((match) => !match.alreadyFound)
  return {
    sheets: nextSheets,
    unmatched,
    result: anyNew
      ? { kind: 'match', value, matches }
      : { kind: 'already', value, matches },
  }
}
