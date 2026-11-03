import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseSpreadsheetBuffer } from '../lib/parseSpreadsheet'
import { AppProvider } from '../state/AppProvider'
import { initialState } from '../state/reducer'
import type { Sheet } from '../lib/types'
import ExportPanel from './ExportPanel'

const FOUND_AT = '2026-11-02T20:15:30.000Z'
const NOW = new Date(2026, 10, 2, 9, 5)

const sheetA: Sheet = {
  id: 'a',
  name: 'Dock A',
  source: 'excel',
  headers: ['Plate', 'Pallet'],
  rows: [
    ['ABC123', 'P-1'],
    ['XYZ789', 'P-2'],
  ],
  matchColumn: 0,
  found: { 1: FOUND_AT },
}
const sheetB: Sheet = { ...sheetA, id: 'b', name: 'Dock B', found: {} }

function setup(
  mode: React.ComponentProps<typeof ExportPanel>['mode'],
  download = vi.fn(),
  sheets = [sheetA, sheetB],
) {
  render(
    <AppProvider
      initial={{
        ...initialState,
        sheets,
        unmatched: [{ value: 'NOPE', scannedAt: FOUND_AT, scope: 'All sheets' }],
      }}
    >
      <ExportPanel mode={mode} download={download} now={() => NOW} />
    </AppProvider>,
  )
  return download
}

const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(blob)
  })

const readBuffer = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })

describe('ExportPanel (one sheet)', () => {
  it('downloads the sheet as CSV with Found columns', async () => {
    const download = setup({ kind: 'sheet', sheetId: 'a' })
    await userEvent.click(screen.getByRole('button', { name: /download csv/i }))

    expect(download).toHaveBeenCalledTimes(1)
    const [name, blob] = download.mock.calls[0]
    expect(name).toBe('Dock A 2026-11-02.csv')
    const text = await readText(blob)
    expect(text.split(/\r?\n/)[0]).toBe('Plate,Pallet,Found,Scanned At')
    expect(text).toContain('ABC123,P-1,No,')
    expect(text).toContain('XYZ789,P-2,Yes,')
    expect(await screen.findByRole('status')).toHaveTextContent('Dock A 2026-11-02.csv')
  })

  it('downloads an Excel workbook that reads back', async () => {
    const download = setup({ kind: 'sheet', sheetId: 'a' })
    await userEvent.click(screen.getByRole('button', { name: /download excel/i }))

    await screen.findByRole('status')
    const [name, blob] = download.mock.calls[0]
    expect(name).toBe('Dock A 2026-11-02.xlsx')
    const [tab] = await parseSpreadsheetBuffer(await readBuffer(blob), name)
    expect(tab.rows).toHaveLength(2)
  })

  it('exports only found rows when asked', async () => {
    const download = setup({ kind: 'sheet', sheetId: 'a' })
    await userEvent.selectOptions(screen.getByLabelText(/rows to include/i), 'Found only')
    await userEvent.click(screen.getByRole('button', { name: /download csv/i }))

    const [name, blob] = download.mock.calls[0]
    expect(name).toBe('Dock A found 2026-11-02.csv')
    const text = await readText(blob)
    expect(text).toContain('XYZ789')
    expect(text).not.toContain('ABC123')
  })

  it('exports only rows not found when asked', async () => {
    const download = setup({ kind: 'sheet', sheetId: 'a' })
    await userEvent.selectOptions(
      screen.getByLabelText(/rows to include/i),
      'Not found only',
    )
    await userEvent.click(screen.getByRole('button', { name: /download csv/i }))

    const [name, blob] = download.mock.calls[0]
    expect(name).toBe('Dock A not found 2026-11-02.csv')
    const text = await readText(blob)
    expect(text).toContain('ABC123')
    expect(text).not.toContain('XYZ789')
  })

  it('shows an error if the download fails', async () => {
    setup(
      { kind: 'sheet', sheetId: 'a' },
      vi.fn(() => {
        throw new Error('blocked')
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: /download csv/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/export failed/i)
  })

  it('renders nothing for an unknown sheet', () => {
    setup({ kind: 'sheet', sheetId: 'zzz' })
    expect(screen.queryByText(/export/i)).toBeNull()
  })
})

describe('ExportPanel (whole session)', () => {
  it('offers one Excel file with every sheet and the unmatched scans', async () => {
    const download = setup({ kind: 'session' })
    expect(screen.queryByRole('button', { name: /csv/i })).toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: /download excel \(all sheets\)/i }),
    )
    await screen.findByRole('status')

    const [name, blob] = download.mock.calls[0]
    expect(name).toBe('findmypallets 2026-11-02.xlsx')
    const tabs = await parseSpreadsheetBuffer(await readBuffer(blob), name)
    expect(tabs.map((t) => t.name)).toEqual(['Dock A', 'Dock B', 'Unmatched Scans'])
    expect(tabs[2].rows[0][0]).toBe('NOPE')
  })
})
