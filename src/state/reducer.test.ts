import type { Sheet } from '../lib/types'
import { initialState, reducer, type AppState } from './reducer'

const NOW = new Date('2026-11-02T20:00:00.000Z')

function sheet(id: string, overrides: Partial<Sheet> = {}): Sheet {
  return {
    id,
    name: `Sheet ${id}`,
    source: 'excel',
    headers: ['Plate', 'Pallet'],
    rows: [
      ['ABC123', 'P-1'],
      ['XYZ789', 'P-2'],
    ],
    matchColumn: 0,
    found: {},
    ...overrides,
  }
}

function stateWith(sheets: Sheet[], extra: Partial<AppState> = {}): AppState {
  return { ...initialState, sheets, ...extra }
}

describe('reducer', () => {
  it('starts empty with the all-sheets scope', () => {
    expect(initialState).toEqual({
      sheets: [],
      unmatched: [],
      scope: { kind: 'all' },
      lastScan: null,
    })
  })

  describe('add-sheets', () => {
    it('appends sheets in order', () => {
      const s1 = reducer(initialState, { type: 'add-sheets', sheets: [sheet('a')] })
      const s2 = reducer(s1, {
        type: 'add-sheets',
        sheets: [sheet('b'), sheet('c')],
      })
      expect(s2.sheets.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('delete-sheet / restore-sheet', () => {
    it('removes a sheet and the unmatched scans from searching only it', () => {
      const state = stateWith([sheet('a'), sheet('b')], {
        unmatched: [
          { value: '1', scannedAt: 't', scope: 'Sheet a' },
          { value: '2', scannedAt: 't', scope: 'All sheets' },
          { value: '3', scannedAt: 't', scope: 'Sheet b' },
        ],
      })
      const next = reducer(state, { type: 'delete-sheet', id: 'a' })
      expect(next.sheets.map((s) => s.id)).toEqual(['b'])
      expect(next.unmatched.map((u) => u.value)).toEqual(['2', '3'])
    })

    it('falls back to the all scope when the scoped sheet is deleted', () => {
      const state = stateWith([sheet('a')], {
        scope: { kind: 'sheet', sheetId: 'a' },
      })
      expect(reducer(state, { type: 'delete-sheet', id: 'a' }).scope).toEqual({
        kind: 'all',
      })
    })

    it('restores a deleted sheet at its old position with its scans', () => {
      const a = sheet('a')
      const state = stateWith([a, sheet('b'), sheet('c')])
      const removed = reducer(state, { type: 'delete-sheet', id: 'a' })
      const restored = reducer(removed, {
        type: 'restore-sheet',
        sheet: a,
        index: 0,
        unmatched: [{ value: 'x', scannedAt: 't', scope: 'Sheet a' }],
      })
      expect(restored.sheets.map((s) => s.id)).toEqual(['a', 'b', 'c'])
      expect(restored.unmatched).toEqual([
        { value: 'x', scannedAt: 't', scope: 'Sheet a' },
      ])
    })

    it('ignores deleting an unknown sheet', () => {
      const state = stateWith([sheet('a')])
      expect(reducer(state, { type: 'delete-sheet', id: 'zzz' })).toBe(state)
    })
  })

  describe('set-match-column', () => {
    it('sets the column', () => {
      const state = stateWith([sheet('a', { matchColumn: null })])
      const next = reducer(state, {
        type: 'set-match-column',
        id: 'a',
        column: 1,
      })
      expect(next.sheets[0].matchColumn).toBe(1)
    })

    it('clears found marks when the column changes, since they no longer apply', () => {
      const state = stateWith([sheet('a', { found: { 0: 't' } })])
      const next = reducer(state, {
        type: 'set-match-column',
        id: 'a',
        column: 1,
      })
      expect(next.sheets[0].found).toEqual({})
    })

    it('keeps found marks when the same column is chosen again', () => {
      const state = stateWith([sheet('a', { found: { 0: 't' } })])
      const next = reducer(state, {
        type: 'set-match-column',
        id: 'a',
        column: 0,
      })
      expect(next.sheets[0].found).toEqual({ 0: 't' })
    })
  })

  describe('edit-cell', () => {
    it('changes one cell without touching others', () => {
      const state = stateWith([sheet('a')])
      const next = reducer(state, {
        type: 'edit-cell',
        id: 'a',
        row: 1,
        col: 0,
        value: 'NEW999',
      })
      expect(next.sheets[0].rows).toEqual([
        ['ABC123', 'P-1'],
        ['NEW999', 'P-2'],
      ])
      expect(state.sheets[0].rows[1][0]).toBe('XYZ789')
    })

    it('ignores out-of-range edits', () => {
      const state = stateWith([sheet('a')])
      expect(
        reducer(state, { type: 'edit-cell', id: 'a', row: 9, col: 0, value: 'x' }),
      ).toBe(state)
      expect(
        reducer(state, { type: 'edit-cell', id: 'a', row: 0, col: 9, value: 'x' }),
      ).toBe(state)
    })
  })

  describe('scan', () => {
    it('marks the row found and records the result', () => {
      const state = stateWith([sheet('a')])
      const next = reducer(state, { type: 'scan', value: 'ABC123', now: NOW })
      expect(next.sheets[0].found).toEqual({ 0: NOW.toISOString() })
      expect(next.lastScan?.kind).toBe('match')
    })

    it('logs unmatched scans', () => {
      const state = stateWith([sheet('a')])
      const next = reducer(state, { type: 'scan', value: 'NOPE', now: NOW })
      expect(next.lastScan).toEqual({ kind: 'none', value: 'NOPE' })
      expect(next.unmatched).toHaveLength(1)
    })

    it('respects the chosen scope', () => {
      const state = stateWith(
        [sheet('a'), sheet('b', { rows: [['ONLYB', 'P']] })],
        { scope: { kind: 'sheet', sheetId: 'a' } },
      )
      const next = reducer(state, { type: 'scan', value: 'ONLYB', now: NOW })
      expect(next.lastScan?.kind).toBe('none')
    })
  })

  describe('set-scope / clear-last-scan', () => {
    it('changes scope and clears the previous result', () => {
      const state = stateWith([sheet('a')], {
        lastScan: { kind: 'none', value: 'x' },
      })
      const next = reducer(state, {
        type: 'set-scope',
        scope: { kind: 'sheet', sheetId: 'a' },
      })
      expect(next.scope).toEqual({ kind: 'sheet', sheetId: 'a' })
      expect(next.lastScan).toBeNull()
    })

    it('clears the last result', () => {
      const state = stateWith([], { lastScan: { kind: 'empty' } })
      expect(reducer(state, { type: 'clear-last-scan' }).lastScan).toBeNull()
    })
  })

  describe('reset-progress', () => {
    it('clears found marks for one sheet only', () => {
      const state = stateWith([
        sheet('a', { found: { 0: 't' } }),
        sheet('b', { found: { 1: 't' } }),
      ])
      const next = reducer(state, { type: 'reset-progress', id: 'a' })
      expect(next.sheets[0].found).toEqual({})
      expect(next.sheets[1].found).toEqual({ 1: 't' })
      expect(next.sheets[0].rows).toEqual(state.sheets[0].rows)
    })

    it('also clears the shown result', () => {
      const state = stateWith([sheet('a')], {
        lastScan: { kind: 'none', value: 'x' },
      })
      expect(
        reducer(state, { type: 'reset-progress', id: 'a' }).lastScan,
      ).toBeNull()
    })
  })

  describe('clear actions', () => {
    it('clears the unmatched log', () => {
      const state = stateWith([sheet('a')], {
        unmatched: [{ value: 'x', scannedAt: 't', scope: 'All sheets' }],
      })
      const next = reducer(state, { type: 'clear-unmatched' })
      expect(next.unmatched).toEqual([])
      expect(next.sheets).toEqual(state.sheets)
    })

    it('clears everything', () => {
      const state = stateWith([sheet('a')], {
        scope: { kind: 'sheet', sheetId: 'a' },
        unmatched: [{ value: 'x', scannedAt: 't', scope: 'All sheets' }],
        lastScan: { kind: 'empty' },
      })
      expect(reducer(state, { type: 'clear-all' })).toEqual(initialState)
    })
  })

  describe('load', () => {
    it('replaces saved data and drops any transient result', () => {
      const loaded = reducer(initialState, {
        type: 'load',
        data: {
          sheets: [sheet('a')],
          unmatched: [{ value: 'x', scannedAt: 't', scope: 'All sheets' }],
          scope: { kind: 'sheet', sheetId: 'a' },
        },
      })
      expect(loaded.sheets).toHaveLength(1)
      expect(loaded.unmatched).toHaveLength(1)
      expect(loaded.scope).toEqual({ kind: 'sheet', sheetId: 'a' })
      expect(loaded.lastScan).toBeNull()
    })

    it('repairs a saved scope that points at a missing sheet', () => {
      const loaded = reducer(initialState, {
        type: 'load',
        data: {
          sheets: [sheet('a')],
          unmatched: [],
          scope: { kind: 'sheet', sheetId: 'gone' },
        },
      })
      expect(loaded.scope).toEqual({ kind: 'all' })
    })
  })
})
