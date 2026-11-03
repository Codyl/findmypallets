import 'fake-indexeddb/auto'
import { createIdbStorage, parsePersisted } from './storage'
import type { PersistedState } from '../state/reducer'

const sample: PersistedState = {
  sheets: [
    {
      id: 'a',
      name: 'Dock A',
      source: 'excel',
      headers: ['Plate', 'Pallet'],
      rows: [
        ['ABC123', 'P-1'],
        ['XYZ789', 'P-2'],
      ],
      matchColumn: 0,
      found: { 1: '2026-11-02T20:00:00.000Z' },
    },
  ],
  unmatched: [
    { value: 'NOPE', scannedAt: '2026-11-02T20:01:00.000Z', scope: 'All sheets' },
  ],
  scope: { kind: 'sheet', sheetId: 'a' },
}

let counter = 0
const freshStorage = () => createIdbStorage(`test-db-${(counter += 1)}`)

describe('createIdbStorage', () => {
  it('returns null when nothing has been saved', async () => {
    expect(await freshStorage().load()).toBeNull()
  })

  it('saves and loads the same data', async () => {
    const storage = freshStorage()
    await storage.save(sample)
    expect(await storage.load()).toEqual(sample)
  })

  it('overwrites earlier saves', async () => {
    const storage = freshStorage()
    await storage.save(sample)
    await storage.save({ ...sample, sheets: [], unmatched: [] })
    const loaded = await storage.load()
    expect(loaded?.sheets).toEqual([])
    expect(loaded?.unmatched).toEqual([])
  })

  it('clears saved data', async () => {
    const storage = freshStorage()
    await storage.save(sample)
    await storage.clear()
    expect(await storage.load()).toBeNull()
  })

  it('keeps separate databases separate', async () => {
    const a = freshStorage()
    const b = freshStorage()
    await a.save(sample)
    expect(await b.load()).toBeNull()
  })
})

describe('parsePersisted', () => {
  it('accepts valid data', () => {
    expect(parsePersisted(sample)).toEqual(sample)
  })

  it.each([null, undefined, 'text', 42, [], {}, { sheets: 'x' }])(
    'rejects %j',
    (value) => {
      expect(parsePersisted(value)).toBeNull()
    },
  )

  it('drops malformed sheets but keeps good ones', () => {
    const parsed = parsePersisted({
      ...sample,
      sheets: [sample.sheets[0], { id: 5 }, null, { ...sample.sheets[0], rows: 'x' }],
    })
    expect(parsed?.sheets).toEqual(sample.sheets)
  })

  it('drops malformed unmatched entries', () => {
    const parsed = parsePersisted({
      ...sample,
      unmatched: [sample.unmatched[0], { value: 1 }, 'x'],
    })
    expect(parsed?.unmatched).toEqual(sample.unmatched)
  })

  it('falls back to the all scope when the scope is invalid', () => {
    expect(parsePersisted({ ...sample, scope: 'bad' })?.scope).toEqual({
      kind: 'all',
    })
  })

  it('discards a match column that is out of range', () => {
    const parsed = parsePersisted({
      ...sample,
      sheets: [{ ...sample.sheets[0], matchColumn: 9 }],
    })
    expect(parsed?.sheets[0].matchColumn).toBeNull()
  })

  it('discards found marks for rows that do not exist', () => {
    const parsed = parsePersisted({
      ...sample,
      sheets: [{ ...sample.sheets[0], found: { 1: 't', 99: 't' } }],
    })
    expect(parsed?.sheets[0].found).toEqual({ 1: 't' })
  })
})
