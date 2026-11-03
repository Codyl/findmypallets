import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExcelJS from 'exceljs'
import { AppProvider } from '../state/AppProvider'
import { initialState } from '../state/reducer'
import type { Sheet } from '../lib/types'
import HomeScreen from './HomeScreen'

function renderHome(
  props: Partial<React.ComponentProps<typeof HomeScreen>> = {},
  sheets: Sheet[] = [],
) {
  const onOpenSheet = vi.fn()
  const onStartScan = vi.fn()
  render(
    <AppProvider initial={{ ...initialState, sheets }}>
      <HomeScreen
        onOpenSheet={onOpenSheet}
        onStartScan={onStartScan}
        {...props}
      />
    </AppProvider>,
  )
  return { onOpenSheet, onStartScan }
}

function csvFile(name: string, text: string) {
  return new File([text], name, { type: 'text/csv' })
}

async function xlsxFile(name: string, tabs: Record<string, string[][]>) {
  const wb = new ExcelJS.Workbook()
  for (const [tabName, rows] of Object.entries(tabs)) {
    const ws = wb.addWorksheet(tabName)
    rows.forEach((row) => ws.addRow(row))
  }
  const buffer = await wb.xlsx.writeBuffer()
  return new File([buffer], name)
}

const fileInput = () =>
  screen.getByLabelText(/add from excel or csv/i, { selector: 'input' })

describe('HomeScreen', () => {
  it('shows an empty state and disables scanning with no sheets', () => {
    renderHome()
    expect(screen.getByText(/no sheets yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start scanning/i })).toBeDisabled()
  })

  it('adds a sheet from a CSV and auto-selects the plate column', async () => {
    renderHome()
    await userEvent.upload(
      fileInput(),
      csvFile('Dock A.csv', 'License Plate,Pallet\nABC123,P-1\nXYZ789,P-2\n'),
    )

    const card = await screen.findByRole('listitem')
    expect(within(card).getByText('Dock A')).toBeInTheDocument()
    expect(within(card).getByText('0 of 2 found')).toBeInTheDocument()
    expect(within(card).queryByText(/no plate column set/i)).toBeNull()
    expect(screen.getByRole('button', { name: /start scanning/i })).toBeEnabled()
  })

  it('flags a sheet whose plate column could not be detected', async () => {
    renderHome()
    await userEvent.upload(fileInput(), csvFile('x.csv', 'Lot,Qty\n1,2\n'))

    const card = await screen.findByRole('listitem')
    expect(within(card).getByText(/no plate column set/i)).toBeInTheDocument()
  })

  it('adds one sheet per ticked tab of a multi-tab workbook', async () => {
    renderHome()
    await userEvent.upload(
      fileInput(),
      await xlsxFile('load.xlsx', {
        'Dock A': [['Plate'], ['A1'], ['A2']],
        'Dock B': [['Plate'], ['B1']],
        'Notes': [['Text'], ['hello']],
      }),
    )

    const dialog = await screen.findByRole('dialog', { name: /choose tabs/i })
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(dialog).getByLabelText(/dock a/i)).toBeChecked()

    await userEvent.click(within(dialog).getByLabelText(/notes/i))
    await userEvent.click(within(dialog).getByRole('button', { name: /add 2 sheets/i }))

    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Notes')).toBeNull()
  })

  it('adds nothing when the tab picker is cancelled', async () => {
    renderHome()
    await userEvent.upload(
      fileInput(),
      await xlsxFile('load.xlsx', {
        A: [['Plate'], ['1']],
        B: [['Plate'], ['2']],
      }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: /^cancel$/i }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('does not allow adding with no tabs ticked', async () => {
    renderHome()
    await userEvent.upload(
      fileInput(),
      await xlsxFile('load.xlsx', {
        A: [['Plate'], ['1']],
        B: [['Plate'], ['2']],
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText('A'))
    await userEvent.click(within(dialog).getByLabelText('B'))
    expect(within(dialog).getByRole('button', { name: /add/i })).toBeDisabled()
  })

  it('shows a helpful error for old .xls files', async () => {
    renderHome()
    await userEvent.upload(fileInput(), new File(['x'], 'old.xls'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/\.xlsx/)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('shows an error for a file with no data', async () => {
    renderHome()
    await userEvent.upload(fileInput(), csvFile('empty.csv', '\n\n'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no data/i)
  })

  it('lets the same file be chosen again after an error', async () => {
    renderHome()
    const bad = csvFile('empty.csv', '\n')
    await userEvent.upload(fileInput(), bad)
    await screen.findByRole('alert')
    await userEvent.upload(fileInput(), csvFile('ok.csv', 'Plate\nA\n'))
    expect(await screen.findByRole('listitem')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens a sheet for review and starts scanning', async () => {
    const sheet: Sheet = {
      id: 'a',
      name: 'Dock A',
      source: 'excel',
      headers: ['Plate'],
      rows: [['A1']],
      matchColumn: 0,
      found: { 0: 't' },
    }
    const { onOpenSheet, onStartScan } = renderHome({}, [sheet])

    expect(screen.getByText('1 of 1 found')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /review dock a/i }))
    expect(onOpenSheet).toHaveBeenCalledWith('a')

    await userEvent.click(screen.getByRole('button', { name: /start scanning/i }))
    expect(onStartScan).toHaveBeenCalled()
  })

  it('offers a whole-session export only once there are sheets', async () => {
    const { unmount } = render(
      <AppProvider>
        <HomeScreen onOpenSheet={vi.fn()} onStartScan={vi.fn()} />
      </AppProvider>,
    )
    expect(screen.queryByText('Export')).toBeNull()
    unmount()

    renderHome({}, [
      {
        id: 'a',
        name: 'Dock A',
        source: 'excel',
        headers: ['Plate'],
        rows: [['A1']],
        matchColumn: 0,
        found: {},
      },
    ])
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /download excel \(all sheets\)/i }),
    ).toBeInTheDocument()
  })

  describe('clearing and deleting', () => {
    const sheetOf = (id: string, name: string, found = {}): Sheet => ({
      id,
      name,
      source: 'excel',
      headers: ['Plate'],
      rows: [['A1'], ['A2']],
      matchColumn: 0,
      found,
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('deletes a sheet after confirming, and undo brings it back in place', async () => {
      renderHome({}, [sheetOf('a', 'Dock A'), sheetOf('b', 'Dock B')])

      await userEvent.click(screen.getByRole('button', { name: /delete dock a/i }))
      const dialog = screen.getByRole('dialog', { name: /delete dock a\?/i })
      await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

      expect(screen.queryByText('Dock A')).toBeNull()
      expect(screen.getByText('Dock B')).toBeInTheDocument()
      const toast = screen.getByRole('status', { name: /undo/i })
      expect(toast).toHaveTextContent('Deleted Dock A')

      await userEvent.click(within(toast).getByRole('button', { name: /undo/i }))

      const cards = screen.getAllByRole('listitem')
      expect(cards[0]).toHaveTextContent('Dock A')
      expect(cards[1]).toHaveTextContent('Dock B')
      expect(screen.queryByRole('status', { name: /undo/i })).toBeNull()
    })

    it('keeps the sheet when deleting is cancelled', async () => {
      renderHome({}, [sheetOf('a', 'Dock A')])
      await userEvent.click(screen.getByRole('button', { name: /delete dock a/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByText('Dock A')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByRole('status', { name: /undo/i })).toBeNull()
    })

    it('lets the undo offer expire after 8 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderHome({}, [sheetOf('a', 'Dock A')])

      await user.click(screen.getByRole('button', { name: /delete dock a/i }))
      await user.click(screen.getByRole('button', { name: /^delete$/i }))
      expect(screen.getByRole('status', { name: /undo/i })).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(7_900)
      })
      expect(screen.getByRole('status', { name: /undo/i })).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(200)
      })
      expect(screen.queryByRole('status', { name: /undo/i })).toBeNull()
      expect(screen.queryByText('Dock A')).toBeNull()
    })

    it('can export a sheet before deleting it', async () => {
      const download = vi.fn()
      renderHome({ download }, [sheetOf('a', 'Dock A')])
      await userEvent.click(screen.getByRole('button', { name: /delete dock a/i }))
      await userEvent.click(screen.getByRole('button', { name: /export first/i }))

      await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
      expect(download.mock.calls[0][0]).toMatch(/^Dock A \d{4}-\d{2}-\d{2}\.xlsx$/)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Dock A')).toBeInTheDocument()
    })

    it('resets progress after confirming but keeps the sheet', async () => {
      renderHome({}, [sheetOf('a', 'Dock A', { 0: 't' })])
      expect(screen.getByText('1 of 2 found')).toBeInTheDocument()

      await userEvent.click(
        screen.getByRole('button', { name: /reset progress for dock a/i }),
      )
      const dialog = screen.getByRole('dialog', { name: /reset progress/i })
      await userEvent.click(within(dialog).getByRole('button', { name: /^reset$/i }))

      expect(screen.getByText('0 of 2 found')).toBeInTheDocument()
      expect(screen.getByText('Dock A')).toBeInTheDocument()
    })

    it('does not offer a reset when nothing has been found', () => {
      renderHome({}, [sheetOf('a', 'Dock A')])
      expect(
        screen.getByRole('button', { name: /reset progress for dock a/i }),
      ).toBeDisabled()
    })

    it('clears every sheet after confirming', async () => {
      renderHome({}, [sheetOf('a', 'Dock A'), sheetOf('b', 'Dock B')])
      await userEvent.click(screen.getByRole('button', { name: /clear all sheets/i }))
      const dialog = screen.getByRole('dialog', { name: /clear all sheets\?/i })
      await userEvent.click(within(dialog).getByRole('button', { name: /^clear all$/i }))

      expect(screen.getByText(/no sheets yet/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /clear all sheets/i })).toBeNull()
    })

    it('can export everything before clearing all', async () => {
      const download = vi.fn()
      renderHome({ download }, [sheetOf('a', 'Dock A')])
      await userEvent.click(screen.getByRole('button', { name: /clear all sheets/i }))
      await userEvent.click(screen.getByRole('button', { name: /export first/i }))
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
      expect(download.mock.calls[0][0]).toMatch(/^findmypallets \d{4}-\d{2}-\d{2}\.xlsx$/)
    })

    it('hides the clear-all button when there is nothing to clear', () => {
      renderHome()
      expect(screen.queryByRole('button', { name: /clear all sheets/i })).toBeNull()
    })
  })
})
