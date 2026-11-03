import { parseSpreadsheetBuffer } from './parseSpreadsheet'
import {
  downloadFile,
  exportFileName,
  formatExportTime,
  sessionToXlsx,
  sheetExportTable,
  sheetToCsv,
  sheetToXlsx,
} from './export'
import type { Sheet, UnmatchedScan } from './types'

const FOUND_AT = '2026-11-02T20:15:30.000Z'

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'a',
    name: 'Dock A',
    source: 'excel',
    headers: ['License Plate', 'Pallet'],
    rows: [
      ['00123', 'P-1'],
      ['XYZ789', 'P-2'],
      ['LMN456', 'P-3'],
    ],
    matchColumn: 0,
    found: { 1: FOUND_AT },
    ...overrides,
  }
}

const unmatched: UnmatchedScan[] = [
  { value: 'NOPE1', scannedAt: FOUND_AT, scope: 'All sheets' },
  { value: 'NOPE2', scannedAt: FOUND_AT, scope: 'Dock A' },
]

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

const textBuffer = (text: string) => toArrayBuffer(new TextEncoder().encode(text))

describe('formatExportTime', () => {
  it('formats as local yyyy-mm-dd hh:mm:ss', () => {
    const d = new Date(FOUND_AT)
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(formatExportTime(FOUND_AT)).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    )
  })
})

describe('sheetExportTable', () => {
  it('adds Found and Scanned At columns to every row', () => {
    const table = sheetExportTable(makeSheet(), 'all')
    expect(table.headers).toEqual(['License Plate', 'Pallet', 'Found', 'Scanned At'])
    expect(table.rows).toEqual([
      ['00123', 'P-1', 'No', ''],
      ['XYZ789', 'P-2', 'Yes', formatExportTime(FOUND_AT)],
      ['LMN456', 'P-3', 'No', ''],
    ])
  })

  it('can keep only found rows', () => {
    const table = sheetExportTable(makeSheet(), 'found')
    expect(table.rows.map((r) => r[0])).toEqual(['XYZ789'])
  })

  it('can keep only rows that were not found', () => {
    const table = sheetExportTable(makeSheet(), 'not-found')
    expect(table.rows.map((r) => r[0])).toEqual(['00123', 'LMN456'])
  })

  it('does not collide with existing Found / Scanned At headings', () => {
    const table = sheetExportTable(
      makeSheet({ headers: ['Plate', 'Found'], rows: [['A', 'maybe']], found: {} }),
      'all',
    )
    expect(table.headers).toEqual(['Plate', 'Found', 'Found (2)', 'Scanned At'])
  })

  it('does not change the sheet', () => {
    const sheet = makeSheet()
    sheetExportTable(sheet, 'found')
    expect(sheet.rows).toHaveLength(3)
  })
})

describe('sheetToCsv', () => {
  it('produces CSV that reads back to the same table', async () => {
    const sheet = makeSheet({
      rows: [
        ['00123', 'has, comma'],
        ['XYZ789', 'has "quotes"'],
      ],
      found: { 0: FOUND_AT },
    })
    const csv = sheetToCsv(sheet, 'all')
    const [tab] = await parseSpreadsheetBuffer(textBuffer(csv), 'x.csv')
    const expected = sheetExportTable(sheet, 'all')
    expect(tab.headers).toEqual(expected.headers)
    expect(tab.rows).toEqual(expected.rows)
  })
})

describe('sheetToXlsx', () => {
  it('produces a workbook that reads back, keeping leading zeros', async () => {
    const buffer = toArrayBuffer(await sheetToXlsx(makeSheet(), 'all'))
    const [tab] = await parseSpreadsheetBuffer(buffer, 'x.xlsx')
    expect(tab.name).toBe('Dock A')
    expect(tab.headers).toEqual(['License Plate', 'Pallet', 'Found', 'Scanned At'])
    expect(tab.rows[0]).toEqual(['00123', 'P-1', 'No', ''])
    expect(tab.rows[1][2]).toBe('Yes')
  })
})

describe('sessionToXlsx', () => {
  it('has one tab per sheet plus an Unmatched Scans tab', async () => {
    const buffer = toArrayBuffer(
      await sessionToXlsx(
        [makeSheet(), makeSheet({ id: 'b', name: 'Dock B' })],
        unmatched,
        'all',
      ),
    )
    const tabs = await parseSpreadsheetBuffer(buffer, 'x.xlsx')
    expect(tabs.map((t) => t.name)).toEqual(['Dock A', 'Dock B', 'Unmatched Scans'])

    const log = tabs[2]
    expect(log.headers).toEqual(['Scanned Value', 'Scanned At', 'Searched In'])
    expect(log.rows).toEqual([
      ['NOPE1', formatExportTime(FOUND_AT), 'All sheets'],
      ['NOPE2', formatExportTime(FOUND_AT), 'Dock A'],
    ])
  })

  it('applies the filter to every sheet', async () => {
    const buffer = toArrayBuffer(
      await sessionToXlsx([makeSheet()], [], 'found'),
    )
    const tabs = await parseSpreadsheetBuffer(buffer, 'x.xlsx')
    expect(tabs[0].rows.map((r) => r[0])).toEqual(['XYZ789'])
  })

  it('still produces a readable file when there are no unmatched scans', async () => {
    const buffer = toArrayBuffer(await sessionToXlsx([makeSheet()], [], 'all'))
    const tabs = await parseSpreadsheetBuffer(buffer, 'x.xlsx')
    expect(tabs.map((t) => t.name)).toEqual(['Dock A', 'Unmatched Scans'])
    expect(tabs[1].rows).toEqual([])
  })

  it('makes tab names valid and unique for Excel', async () => {
    const sheets = [
      makeSheet({ id: '1', name: 'Dock/A: [north]?' }),
      makeSheet({ id: '2', name: 'Dock/A: [north]?' }),
      makeSheet({ id: '3', name: 'x'.repeat(50) }),
      makeSheet({ id: '4', name: 'Unmatched Scans' }),
    ]
    const buffer = toArrayBuffer(await sessionToXlsx(sheets, [], 'all'))
    const names = (await parseSpreadsheetBuffer(buffer, 'x.xlsx')).map((t) => t.name)

    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length)
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(31)
      expect(name).not.toMatch(/[\\/?*[\]:]/)
    }
    expect(names).toContain('Unmatched Scans')
  })
})

describe('exportFileName', () => {
  const date = new Date(2026, 10, 2, 9, 5)

  it('builds name-date.ext', () => {
    expect(exportFileName('Dock A', 'csv', date)).toBe('Dock A 2026-11-02.csv')
  })

  it('adds a label when given', () => {
    expect(exportFileName('Dock A', 'xlsx', date, 'found')).toBe(
      'Dock A found 2026-11-02.xlsx',
    )
  })

  it('removes characters that are not allowed in file names', () => {
    expect(exportFileName('a/b\\c:d*e?"f<g>h|i', 'csv', date)).toBe(
      'a-b-c-d-e--f-g-h-i 2026-11-02.csv',
    )
  })

  it('falls back to a default name', () => {
    expect(exportFileName('   ', 'csv', date)).toBe('findmypallets 2026-11-02.csv')
  })
})

describe('downloadFile', () => {
  it('clicks a temporary download link and cleans up', () => {
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('file.csv')
        expect(this.href).toContain('blob:fake')
      })

    downloadFile('file.csv', new Blob(['a,b']))

    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:fake')
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })
})
