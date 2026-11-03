import Papa from 'papaparse'
import { loadExcel } from './excel'
import type { Sheet, UnmatchedScan } from './types'

export type ExportFilter = 'all' | 'found' | 'not-found'

export interface ExportTable {
  headers: string[]
  rows: string[][]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local time as yyyy-mm-dd hh:mm:ss, easy to read and sort in a spreadsheet. */
export function formatExportTime(iso: string): string {
  const d = new Date(iso)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

function uniqueHeader(wanted: string, taken: string[]): string {
  const lower = new Set(taken.map((h) => h.toLowerCase()))
  let candidate = wanted
  let n = 1
  while (lower.has(candidate.toLowerCase())) {
    n += 1
    candidate = `${wanted} (${n})`
  }
  return candidate
}

/** The sheet's own columns plus Found (Yes/No) and Scanned At. */
export function sheetExportTable(sheet: Sheet, filter: ExportFilter): ExportTable {
  const foundHeader = uniqueHeader('Found', sheet.headers)
  const timeHeader = uniqueHeader('Scanned At', [...sheet.headers, foundHeader])

  const rows: string[][] = []
  sheet.rows.forEach((row, index) => {
    const foundAt = sheet.found[index]
    const isFound = foundAt !== undefined
    if (filter === 'found' && !isFound) return
    if (filter === 'not-found' && isFound) return
    rows.push([
      ...row,
      isFound ? 'Yes' : 'No',
      isFound ? formatExportTime(foundAt) : '',
    ])
  })

  return { headers: [...sheet.headers, foundHeader, timeHeader], rows }
}

export function sheetToCsv(sheet: Sheet, filter: ExportFilter): string {
  const { headers, rows } = sheetExportTable(sheet, filter)
  return Papa.unparse({ fields: headers, data: rows })
}

type Worksheet = import('exceljs').Worksheet

function fillWorksheet(ws: Worksheet, table: ExportTable) {
  ws.addRow(table.headers)
  table.rows.forEach((row) => ws.addRow(row))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  table.headers.forEach((header, i) => {
    const longest = Math.max(
      header.length,
      ...table.rows.map((row) => (row[i] ?? '').length),
    )
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 8), 40)
  })
}

async function workbookBytes(
  build: (wb: import('exceljs').Workbook) => void,
): Promise<Uint8Array> {
  const { Workbook } = await loadExcel()
  const workbook = new Workbook()
  build(workbook)
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
}

const INVALID_TAB_CHARS = /[\\/?*[\]:]/g
const MAX_TAB_LENGTH = 31
const UNMATCHED_TAB = 'Unmatched Scans'

/** Excel tab names: no \ / ? * [ ] :, at most 31 characters, and unique. */
function tabName(wanted: string, used: Set<string>): string {
  const base =
    wanted.replace(INVALID_TAB_CHARS, '-').trim().slice(0, MAX_TAB_LENGTH) || 'Sheet'
  let candidate = base
  let n = 1
  while (used.has(candidate.toLowerCase())) {
    n += 1
    const suffix = ` (${n})`
    candidate = base.slice(0, MAX_TAB_LENGTH - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export async function sheetToXlsx(
  sheet: Sheet,
  filter: ExportFilter,
): Promise<Uint8Array> {
  return workbookBytes((wb) => {
    const ws = wb.addWorksheet(tabName(sheet.name, new Set()))
    fillWorksheet(ws, sheetExportTable(sheet, filter))
  })
}

/** Every sheet on its own tab, plus a tab listing the unmatched scans. */
export async function sessionToXlsx(
  sheets: Sheet[],
  unmatched: UnmatchedScan[],
  filter: ExportFilter,
): Promise<Uint8Array> {
  return workbookBytes((wb) => {
    const used = new Set([UNMATCHED_TAB.toLowerCase()])
    for (const sheet of sheets) {
      const ws = wb.addWorksheet(tabName(sheet.name, used))
      fillWorksheet(ws, sheetExportTable(sheet, filter))
    }
    const log = wb.addWorksheet(UNMATCHED_TAB)
    fillWorksheet(log, {
      headers: ['Scanned Value', 'Scanned At', 'Searched In'],
      rows: unmatched.map((u) => [
        u.value,
        formatExportTime(u.scannedAt),
        u.scope,
      ]),
    })
  })
}

/** "Dock A found 2026-11-02.csv", with characters Windows/macOS reject removed. */
export function exportFileName(
  base: string,
  extension: 'csv' | 'xlsx',
  date: Date,
  label?: string,
): string {
  const clean = (text: string) => text.replace(/[\\/:*?"<>|]/g, '-').trim()
  const name = clean(base) || 'findmypallets'
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return [name, label, stamp].filter(Boolean).join(' ') + `.${extension}`
}

/** Saves a file from the browser (on phones this opens the share/save sheet). */
export function downloadFile(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
