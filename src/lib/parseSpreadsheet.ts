import Papa from 'papaparse'

/** One tab of an uploaded workbook (or the single sheet of a CSV). */
export interface ParsedTab {
  name: string
  /** Row 1 of the tab. Always unique and never blank. */
  headers: string[]
  /** Every row after the headings; each row has exactly headers.length cells. */
  rows: string[][]
}

/** Thrown for files we cannot read, with a message safe to show the user. */
export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpreadsheetError'
  }
}

type ExcelModule = typeof import('exceljs')

const CSV_EXTENSIONS = ['csv', 'tsv', 'txt']
const EXCEL_EXTENSIONS = ['xlsx', 'xlsm']

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

function baseNameOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  return base.trim() || 'Sheet'
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function columnLetter(index: number): string {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/** Fill blank headings ("Column C") and de-duplicate ("Plate", "Plate (2)"). */
function cleanHeaders(raw: string[]): string[] {
  const used = new Set<string>()
  return raw.map((heading, index) => {
    const base = heading || `Column ${columnLetter(index)}`
    let candidate = base
    let count = 1
    while (used.has(candidate.toLowerCase())) {
      count += 1
      candidate = `${base} (${count})`
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

/**
 * Turns a raw grid of cell text into a tab. Row 1 (the first non-empty row)
 * is the headings. Returns null when the grid has no data at all.
 */
export function buildTab(name: string, grid: string[][]): ParsedTab | null {
  const trimmed = grid
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ''))
  if (trimmed.length === 0) return null

  const [headerRow, ...dataRows] = trimmed
  let width = Math.max(...trimmed.map((row) => row.length))

  // Drop trailing columns that have no heading and no data.
  const columnIsEmpty = (col: number) =>
    (headerRow[col] ?? '') === '' &&
    dataRows.every((row) => (row[col] ?? '') === '')
  while (width > 0 && columnIsEmpty(width - 1)) width -= 1

  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, col) => row[col] ?? '')

  return {
    name,
    headers: cleanHeaders(pad(headerRow)),
    rows: dataRows.map(pad),
  }
}

/**
 * exceljs does not apply Excel's display formats, so handle the common ones:
 * zero-padded numbers (0000) and fixed decimals (0.00). Other number formats
 * show the plain value.
 */
function formatNumber(value: number, numFmt: string | undefined): string {
  if (numFmt) {
    if (/^0+$/.test(numFmt)) {
      return String(Math.round(value)).padStart(numFmt.length, '0')
    }
    const decimals = /^0*\.(0+)$/.exec(numFmt)
    if (decimals) return value.toFixed(decimals[1].length)
  }
  return String(value)
}

/** yyyy-mm-dd, plus hh:mm when the cell holds a time of day (UTC). */
function formatDate(value: Date): string {
  const iso = value.toISOString()
  const date = iso.slice(0, 10)
  const time = iso.slice(11, 16)
  return time === '00:00' ? date : `${date} ${time}`
}

function cellText(cell: import('exceljs').Cell): string {
  let value: unknown = cell.value
  if (value && typeof value === 'object' && 'result' in value) {
    value = value.result
  }
  if (typeof value === 'number') return formatNumber(value, cell.numFmt)
  if (value instanceof Date) return formatDate(value)
  if (value === null || value === undefined) return ''
  return cell.text ?? ''
}

async function parseExcel(data: ArrayBuffer): Promise<ParsedTab[]> {
  const mod = (await import('exceljs')) as ExcelModule & {
    default?: ExcelModule
  }
  const Workbook = mod.Workbook ?? mod.default?.Workbook
  const workbook = new Workbook()
  try {
    await workbook.xlsx.load(data)
  } catch {
    throw new SpreadsheetError(
      'This file could not be read. Make sure it is a valid .xlsx workbook.',
    )
  }

  const tabs: ParsedTab[] = []
  for (const sheet of workbook.worksheets) {
    const grid: string[][] = []
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r)
      const cells: string[] = []
      for (let c = 1; c <= sheet.columnCount; c += 1) {
        cells.push(cellText(row.getCell(c)))
      }
      grid.push(cells)
    }
    const tab = buildTab(sheet.name, grid)
    if (tab) tabs.push(tab)
  }
  return tabs
}

function parseCsv(data: ArrayBuffer, fileName: string): ParsedTab[] {
  const text = new TextDecoder('utf-8').decode(data).replace(/^﻿/, '')
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
  const grid = result.data.map((row) => row.map((cell) => String(cell ?? '')))
  const tab = buildTab(baseNameOf(fileName), grid)
  return tab ? [tab] : []
}

/**
 * Reads a spreadsheet's bytes. Supports .xlsx/.xlsm and CSV/TSV text.
 * Every value comes back as the text shown in the spreadsheet, so a lot or
 * plate such as 00123 is never turned into the number 123.
 */
export async function parseSpreadsheetBuffer(
  data: ArrayBuffer,
  fileName: string,
): Promise<ParsedTab[]> {
  const ext = extensionOf(fileName)

  let tabs: ParsedTab[]
  if (EXCEL_EXTENSIONS.includes(ext)) {
    tabs = await parseExcel(data)
  } else if (CSV_EXTENSIONS.includes(ext)) {
    tabs = parseCsv(data, fileName)
  } else if (ext === 'xls') {
    throw new SpreadsheetError(
      'Older .xls files are not supported. In Excel, choose Save As and pick .xlsx, then upload that.',
    )
  } else {
    throw new SpreadsheetError(
      'Unsupported file type. Upload an .xlsx or .csv file.',
    )
  }

  if (tabs.length === 0) {
    throw new SpreadsheetError('No data was found in this file.')
  }
  return tabs
}

/** Browser entry point for a file chosen with an <input type="file">. */
export async function parseSpreadsheet(file: File): Promise<ParsedTab[]> {
  return parseSpreadsheetBuffer(await file.arrayBuffer(), file.name)
}
