import {
  applyScan,
  createSheet,
  getScanTargets,
  sheetProgress,
} from './matcher'
import type { Sheet, UnmatchedScan } from './types'

const NOW = new Date('2026-11-02T20:00:00.000Z')

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 's1',
    name: 'Dock A',
    source: 'excel',
    headers: ['License Plate', 'Pallet'],
    rows: [
      ['ABC123', 'P-1'],
      ['XYZ789', 'P-2'],
      ['LMN456', 'P-3'],
    ],
    matchColumn: 0,
    found: {},
    ...overrides,
  }
}

describe('createSheet', () => {
  it('builds a sheet and auto-selects the plate column', () => {
    const sheet = createSheet(
      { name: 'Dock A', headers: ['Pallet', 'Plate'], rows: [['P-1', 'A']] },
      'id-1',
    )
    expect(sheet).toEqual({
      id: 'id-1',
      name: 'Dock A',
      source: 'excel',
      headers: ['Pallet', 'Plate'],
      rows: [['P-1', 'A']],
      matchColumn: 1,
      found: {},
    })
  })

  it('leaves the column unset when it cannot decide', () => {
    expect(
      createSheet({ name: 'X', headers: ['A', 'B'], rows: [] }, 'i').matchColumn,
    ).toBeNull()
    expect(
      createSheet({ name: 'X', headers: ['Plate A', 'Plate B'], rows: [] }, 'i')
        .matchColumn,
    ).toBeNull()
  })
})

describe('sheetProgress', () => {
  it('counts found rows against total rows', () => {
    const sheet = makeSheet({ found: { 0: 't', 2: 't' } })
    expect(sheetProgress(sheet)).toEqual({ found: 2, total: 3 })
  })
})

describe('getScanTargets', () => {
  const a = makeSheet({ id: 'a' })
  const b = makeSheet({ id: 'b', matchColumn: null })
  const c = makeSheet({ id: 'c' })

  it('returns every sheet with a match column for the all scope', () => {
    const { active, skipped } = getScanTargets([a, b, c], { kind: 'all' })
    expect(active.map((s) => s.id)).toEqual(['a', 'c'])
    expect(skipped.map((s) => s.id)).toEqual(['b'])
  })

  it('returns only the chosen sheet for the sheet scope', () => {
    const { active } = getScanTargets([a, b, c], { kind: 'sheet', sheetId: 'c' })
    expect(active.map((s) => s.id)).toEqual(['c'])
  })

  it('returns nothing when the chosen sheet has no match column or is gone', () => {
    expect(
      getScanTargets([a, b], { kind: 'sheet', sheetId: 'b' }).active,
    ).toEqual([])
    expect(
      getScanTargets([a], { kind: 'sheet', sheetId: 'zzz' }).active,
    ).toEqual([])
  })
})

describe('applyScan', () => {
  it('matches a plate exactly and marks the row found', () => {
    const sheet = makeSheet()
    const out = applyScan([sheet], [], 'XYZ789', { kind: 'all' }, NOW)

    expect(out.result.kind).toBe('match')
    if (out.result.kind !== 'match') return
    expect(out.result.matches).toEqual([
      {
        sheetId: 's1',
        sheetName: 'Dock A',
        rowIndex: 1,
        headers: ['License Plate', 'Pallet'],
        row: ['XYZ789', 'P-2'],
        alreadyFound: false,
        foundAt: NOW.toISOString(),
      },
    ])
    expect(out.sheets[0].found).toEqual({ 1: NOW.toISOString() })
    expect(out.unmatched).toEqual([])
  })

  it('does not mutate the sheets it was given', () => {
    const sheet = makeSheet()
    applyScan([sheet], [], 'ABC123', { kind: 'all' }, NOW)
    expect(sheet.found).toEqual({})
  })

  it('trims whitespace around the scan', () => {
    const out = applyScan([makeSheet()], [], '  ABC123 \n', { kind: 'all' }, NOW)
    expect(out.result.kind).toBe('match')
  })

  it('compares exactly: case differences do not match', () => {
    const out = applyScan([makeSheet()], [], 'abc123', { kind: 'all' }, NOW)
    expect(out.result).toEqual({ kind: 'none', value: 'abc123' })
  })

  it('logs unmatched scans with time and scope label', () => {
    const out = applyScan(
      [makeSheet()],
      [],
      'NOPE',
      { kind: 'sheet', sheetId: 's1' },
      NOW,
    )
    expect(out.result).toEqual({ kind: 'none', value: 'NOPE' })
    expect(out.unmatched).toEqual<UnmatchedScan[]>([
      { value: 'NOPE', scannedAt: NOW.toISOString(), scope: 'Dock A' },
    ])
    const all = applyScan([makeSheet()], [], 'NOPE', { kind: 'all' }, NOW)
    expect(all.unmatched[0].scope).toBe('All sheets')
  })

  it('appends to the existing unmatched log', () => {
    const existing: UnmatchedScan[] = [
      { value: 'OLD', scannedAt: 't', scope: 'All sheets' },
    ]
    const out = applyScan([makeSheet()], existing, 'NEW', { kind: 'all' }, NOW)
    expect(out.unmatched.map((u) => u.value)).toEqual(['OLD', 'NEW'])
  })

  it('reports already-scanned and keeps the original time', () => {
    const first = new Date('2026-11-02T19:00:00.000Z').toISOString()
    const sheet = makeSheet({ found: { 0: first } })
    const out = applyScan([sheet], [], 'ABC123', { kind: 'all' }, NOW)

    expect(out.result.kind).toBe('already')
    if (out.result.kind !== 'already') return
    expect(out.result.matches[0].alreadyFound).toBe(true)
    expect(out.result.matches[0].foundAt).toBe(first)
    expect(out.sheets[0].found).toEqual({ 0: first })
    expect(out.unmatched).toEqual([])
  })

  it('returns every match when the plate is in several sheets', () => {
    const a = makeSheet({ id: 'a', name: 'A' })
    const b = makeSheet({
      id: 'b',
      name: 'B',
      headers: ['Pallet', 'Plate'],
      rows: [['P-9', 'ABC123']],
      matchColumn: 1,
    })
    const out = applyScan([a, b], [], 'ABC123', { kind: 'all' }, NOW)

    expect(out.result.kind).toBe('match')
    if (out.result.kind !== 'match') return
    expect(out.result.matches.map((m) => [m.sheetName, m.rowIndex])).toEqual([
      ['A', 0],
      ['B', 0],
    ])
    expect(out.sheets[0].found[0]).toBeDefined()
    expect(out.sheets[1].found[0]).toBeDefined()
  })

  it('returns every row when a plate repeats within a sheet', () => {
    const sheet = makeSheet({
      rows: [
        ['ABC123', 'P-1'],
        ['ABC123', 'P-2'],
      ],
    })
    const out = applyScan([sheet], [], 'ABC123', { kind: 'all' }, NOW)
    if (out.result.kind !== 'match') throw new Error('expected match')
    expect(out.result.matches.map((m) => m.rowIndex)).toEqual([0, 1])
    expect(Object.keys(out.sheets[0].found)).toEqual(['0', '1'])
  })

  it('counts as a match when only some of the hits are new', () => {
    const a = makeSheet({ id: 'a', name: 'A', found: { 0: 'earlier' } })
    const b = makeSheet({ id: 'b', name: 'B' })
    const out = applyScan([a, b], [], 'ABC123', { kind: 'all' }, NOW)
    expect(out.result.kind).toBe('match')
    if (out.result.kind !== 'match') return
    expect(out.result.matches.map((m) => m.alreadyFound)).toEqual([true, false])
  })

  it('only searches the chosen sheet for the sheet scope', () => {
    const a = makeSheet({ id: 'a', name: 'A' })
    const b = makeSheet({
      id: 'b',
      name: 'B',
      rows: [['ONLYB', 'P-1']],
    })
    const out = applyScan([a, b], [], 'ONLYB', { kind: 'sheet', sheetId: 'a' }, NOW)
    expect(out.result.kind).toBe('none')
    expect(out.sheets[1].found).toEqual({})
  })

  it('ignores sheets that have no match column', () => {
    const sheet = makeSheet({ matchColumn: null })
    const out = applyScan([sheet], [], 'ABC123', { kind: 'all' }, NOW)
    expect(out.result).toEqual({ kind: 'no-sheets' })
    expect(out.unmatched).toEqual([])
  })

  it('does nothing for an empty scan', () => {
    const sheet = makeSheet()
    const out = applyScan([sheet], [], '   ', { kind: 'all' }, NOW)
    expect(out.result).toEqual({ kind: 'empty' })
    expect(out.sheets).toEqual([sheet])
    expect(out.unmatched).toEqual([])
  })

  it('does not match blank cells against anything', () => {
    const sheet = makeSheet({ rows: [['', 'P-1']] })
    const out = applyScan([sheet], [], '', { kind: 'all' }, NOW)
    expect(out.result.kind).toBe('empty')
  })
})
