import ExcelJS from 'exceljs'
import {
  buildTab,
  columnLetter,
  parseSpreadsheetBuffer,
  SpreadsheetError,
} from './parseSpreadsheet'

async function toBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const out = await workbook.xlsx.writeBuffer()
  const bytes = new Uint8Array(out as ArrayBuffer)
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

function csvBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text)
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

describe('columnLetter', () => {
  it('converts indexes to spreadsheet letters', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(2)).toBe('C')
    expect(columnLetter(25)).toBe('Z')
    expect(columnLetter(26)).toBe('AA')
    expect(columnLetter(27)).toBe('AB')
  })
})

describe('buildTab', () => {
  it('uses the first row as headings and the rest as rows', () => {
    expect(
      buildTab('T', [
        ['Plate', 'Lot'],
        ['ABC123', '7'],
      ]),
    ).toEqual({ name: 'T', headers: ['Plate', 'Lot'], rows: [['ABC123', '7']] })
  })

  it('fills blank headings with the column letter', () => {
    const tab = buildTab('T', [
      ['Plate', '', ''],
      ['A', 'x', 'y'],
    ])
    expect(tab?.headers).toEqual(['Plate', 'Column B', 'Column C'])
  })

  it('numbers duplicate headings, ignoring case', () => {
    const tab = buildTab('T', [
      ['Plate', 'plate', 'Plate'],
      ['A', 'B', 'C'],
    ])
    expect(tab?.headers).toEqual(['Plate', 'plate (2)', 'Plate (3)'])
  })

  it('skips fully blank rows and trims cells', () => {
    const tab = buildTab('T', [
      [' Plate '],
      ['  '],
      [' ABC123 '],
      [''],
      ['XYZ789'],
    ])
    expect(tab?.headers).toEqual(['Plate'])
    expect(tab?.rows).toEqual([['ABC123'], ['XYZ789']])
  })

  it('pads short rows and drops empty trailing columns', () => {
    const tab = buildTab('T', [
      ['Plate', 'Lot', '', ''],
      ['A'],
      ['B', '2', '', ''],
    ])
    expect(tab?.headers).toEqual(['Plate', 'Lot'])
    expect(tab?.rows).toEqual([
      ['A', ''],
      ['B', '2'],
    ])
  })

  it('keeps a tab that has headings but no data rows', () => {
    expect(buildTab('T', [['Plate', 'Lot']])).toEqual({
      name: 'T',
      headers: ['Plate', 'Lot'],
      rows: [],
    })
  })

  it('returns null for an empty grid', () => {
    expect(buildTab('T', [])).toBeNull()
    expect(buildTab('T', [['', ''], ['']])).toBeNull()
  })
})

describe('parseSpreadsheetBuffer (xlsx)', () => {
  it('returns one tab per worksheet with headings and rows', async () => {
    const wb = new ExcelJS.Workbook()
    const a = wb.addWorksheet('Dock A')
    a.addRow(['License Plate', 'Pallet'])
    a.addRow(['ABC123', 'P-1'])
    a.addRow(['XYZ789', 'P-2'])
    const b = wb.addWorksheet('Dock B')
    b.addRow(['Plate', 'Qty'])
    b.addRow(['LMN456', 12])

    const tabs = await parseSpreadsheetBuffer(await toBuffer(wb), 'load.xlsx')

    expect(tabs).toEqual([
      {
        name: 'Dock A',
        headers: ['License Plate', 'Pallet'],
        rows: [
          ['ABC123', 'P-1'],
          ['XYZ789', 'P-2'],
        ],
      },
      { name: 'Dock B', headers: ['Plate', 'Qty'], rows: [['LMN456', '12']] },
    ])
  })

  it('keeps leading zeros for text cells and formatted numbers', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    ws.addRow(['Plate', 'Lot'])
    ws.addRow(['00123', 0])
    ws.getCell('B2').value = 123
    ws.getCell('B2').numFmt = '00000'

    const [tab] = await parseSpreadsheetBuffer(await toBuffer(wb), 'z.xlsx')

    expect(tab.rows).toEqual([['00123', '00123']])
  })

  it('shows dates the way the spreadsheet formats them', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    ws.addRow(['Plate', 'Received'])
    ws.addRow(['A', new Date(Date.UTC(2026, 10, 2))])
    ws.getCell('B2').numFmt = 'yyyy-mm-dd'

    const [tab] = await parseSpreadsheetBuffer(await toBuffer(wb), 'd.xlsx')

    expect(tab.rows).toEqual([['A', '2026-11-02']])
  })

  it('includes the time when a date cell has one', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    ws.addRow(['Plate', 'Received'])
    ws.addRow(['A', new Date(Date.UTC(2026, 10, 2, 13, 5))])

    const [tab] = await parseSpreadsheetBuffer(await toBuffer(wb), 'd.xlsx')

    expect(tab.rows).toEqual([['A', '2026-11-02 13:05']])
  })

  it('applies fixed-decimal number formats', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    ws.addRow(['Plate', 'Weight'])
    ws.addRow(['A', 12.5])
    ws.getCell('B2').numFmt = '0.00'

    const [tab] = await parseSpreadsheetBuffer(await toBuffer(wb), 'n.xlsx')

    expect(tab.rows).toEqual([['A', '12.50']])
  })

  it('reads formula results as text', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    ws.addRow(['Plate', 'Total'])
    ws.addRow(['A'])
    ws.getCell('B2').value = { formula: '1+2', result: 3 }

    const [tab] = await parseSpreadsheetBuffer(await toBuffer(wb), 'f.xlsx')

    expect(tab.rows).toEqual([['A', '3']])
  })

  it('omits tabs that are empty', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Empty')
    const ws = wb.addWorksheet('Data')
    ws.addRow(['Plate'])
    ws.addRow(['A'])

    const tabs = await parseSpreadsheetBuffer(await toBuffer(wb), 'e.xlsx')

    expect(tabs.map((t) => t.name)).toEqual(['Data'])
  })

  it('rejects a workbook with no data anywhere', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Empty')

    await expect(
      parseSpreadsheetBuffer(await toBuffer(wb), 'empty.xlsx'),
    ).rejects.toThrow('No data was found')
  })

  it('rejects a file that is not a real workbook', async () => {
    await expect(
      parseSpreadsheetBuffer(csvBuffer('not a zip'), 'fake.xlsx'),
    ).rejects.toBeInstanceOf(SpreadsheetError)
  })
})

describe('parseSpreadsheetBuffer (csv)', () => {
  it('parses quoted values, CRLF line endings and a BOM', async () => {
    const text = '﻿Plate,Notes\r\nABC123,"fragile, top shelf"\r\nXYZ789,ok\r\n'

    const tabs = await parseSpreadsheetBuffer(csvBuffer(text), 'Inbound Load.csv')

    expect(tabs).toEqual([
      {
        name: 'Inbound Load',
        headers: ['Plate', 'Notes'],
        rows: [
          ['ABC123', 'fragile, top shelf'],
          ['XYZ789', 'ok'],
        ],
      },
    ])
  })

  it('keeps leading zeros', async () => {
    const [tab] = await parseSpreadsheetBuffer(
      csvBuffer('Plate,Lot\n00123,007\n'),
      'z.csv',
    )
    expect(tab.rows).toEqual([['00123', '007']])
  })

  it('detects tab-separated text', async () => {
    const [tab] = await parseSpreadsheetBuffer(
      csvBuffer('Plate\tLot\nABC123\t7\n'),
      'z.tsv',
    )
    expect(tab.headers).toEqual(['Plate', 'Lot'])
    expect(tab.rows).toEqual([['ABC123', '7']])
  })

  it('rejects an empty csv', async () => {
    await expect(
      parseSpreadsheetBuffer(csvBuffer('\n\n'), 'blank.csv'),
    ).rejects.toThrow('No data was found')
  })
})

describe('parseSpreadsheetBuffer (unsupported files)', () => {
  it('explains how to convert legacy .xls files', async () => {
    await expect(
      parseSpreadsheetBuffer(csvBuffer(''), 'old.xls'),
    ).rejects.toThrow('.xlsx')
  })

  it('rejects other file types', async () => {
    await expect(
      parseSpreadsheetBuffer(csvBuffer(''), 'photo.jpg'),
    ).rejects.toBeInstanceOf(SpreadsheetError)
  })
})
