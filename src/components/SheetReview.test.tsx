import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../state/AppProvider'
import { initialState } from '../state/reducer'
import type { Sheet } from '../lib/types'
import SheetReview from './SheetReview'

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'a',
    name: 'Dock A',
    source: 'excel',
    headers: ['Pallet', 'License Plate'],
    rows: [
      ['P-1', 'ABC123'],
      ['P-2', 'XYZ789'],
      ['P-3', 'ABC123'],
      ['P-4', ''],
    ],
    matchColumn: 1,
    found: {},
    ...overrides,
  }
}

function renderReview(sheet: Sheet | null = makeSheet(), sheetId = 'a') {
  const onBack = vi.fn()
  render(
    <AppProvider
      initial={{ ...initialState, sheets: sheet ? [sheet] : [] }}
    >
      <SheetReview sheetId={sheetId} onBack={onBack} />
    </AppProvider>,
  )
  return { onBack }
}

const columnSelect = () => screen.getByLabelText(/plate column/i)

describe('SheetReview', () => {
  it('shows the sheet name, headings and cells', () => {
    renderReview()
    expect(screen.getByRole('heading', { name: 'Dock A' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pallet' })).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'License Plate' }),
    ).toBeInTheDocument()
    expect(screen.getByText('P-2')).toBeInTheDocument()
    expect(screen.getByText('XYZ789')).toBeInTheDocument()
  })

  it('goes back', async () => {
    const { onBack } = renderReview()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('handles a sheet that no longer exists', async () => {
    const { onBack } = renderReview(null)
    expect(screen.getByText(/sheet not found/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  describe('plate column picker', () => {
    it('shows the detected column as selected', () => {
      renderReview()
      expect(columnSelect()).toHaveDisplayValue('License Plate')
    })

    it('asks the user to choose when none is set, then applies the choice', async () => {
      renderReview(makeSheet({ matchColumn: null }))
      expect(columnSelect()).toHaveDisplayValue(/choose column/i)
      expect(screen.getByText(/choose the plate column/i)).toBeInTheDocument()

      await userEvent.selectOptions(columnSelect(), 'License Plate')

      expect(columnSelect()).toHaveDisplayValue('License Plate')
      expect(screen.queryByText(/choose the plate column/i)).toBeNull()
    })

    it('lets the user override the detected column', async () => {
      renderReview()
      await userEvent.selectOptions(columnSelect(), 'Pallet')
      expect(columnSelect()).toHaveDisplayValue('Pallet')
    })

    it('warns that changing the column clears found marks, and does so', async () => {
      renderReview(makeSheet({ found: { 0: 't' } }))
      expect(screen.getByText('1 of 4 found')).toBeInTheDocument()
      expect(
        screen.getByText(/changing the column clears found marks/i),
      ).toBeInTheDocument()

      await userEvent.selectOptions(columnSelect(), 'Pallet')

      expect(screen.getByText('0 of 4 found')).toBeInTheDocument()
    })
  })

  describe('data checks', () => {
    it('reports duplicate and blank plates', () => {
      renderReview()
      const warnings = screen.getByRole('status', { name: /data checks/i })
      expect(warnings).toHaveTextContent(/1 duplicate plate/i)
      expect(warnings).toHaveTextContent(/1 blank/i)
      expect(warnings).toHaveTextContent('ABC123 appears in rows 1 and 3')
    })

    it('shows no warnings for clean data', () => {
      renderReview(
        makeSheet({
          rows: [
            ['P-1', 'A'],
            ['P-2', 'B'],
          ],
        }),
      )
      expect(screen.queryByRole('status', { name: /data checks/i })).toBeNull()
    })

    it('marks duplicate and blank cells in the grid', () => {
      renderReview()
      const rows = screen.getAllByRole('row')
      // rows[0] is the heading row
      expect(rows[1]).toHaveClass('dup')
      expect(rows[3]).toHaveClass('dup')
      expect(rows[2]).not.toHaveClass('dup')
      expect(within(rows[4]).getByText(/blank/i)).toBeInTheDocument()
    })

    it('marks found rows', () => {
      renderReview(makeSheet({ found: { 1: 't' } }))
      const rows = screen.getAllByRole('row')
      expect(within(rows[2]).getByLabelText('Found')).toBeInTheDocument()
      expect(within(rows[1]).queryByLabelText('Found')).toBeNull()
    })
  })

  describe('editing cells', () => {
    const editButton = (header: string, row: number) =>
      screen.getByRole('button', { name: `Edit ${header}, row ${row}` })

    it('saves an edit on Enter and refreshes the checks', async () => {
      renderReview()
      await userEvent.click(editButton('License Plate', 3))
      const input = screen.getByRole('textbox', { name: /edit license plate, row 3/i })
      await userEvent.clear(input)
      await userEvent.type(input, 'NEW999{Enter}')

      expect(screen.getByText('NEW999')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.queryByText(/duplicate plate/i)).toBeNull()
    })

    it('saves an edit when focus leaves the field', async () => {
      renderReview()
      await userEvent.click(editButton('Pallet', 1))
      const input = screen.getByRole('textbox')
      await userEvent.clear(input)
      await userEvent.type(input, 'P-9')
      await userEvent.tab()
      expect(screen.getByText('P-9')).toBeInTheDocument()
    })

    it('cancels an edit on Escape', async () => {
      renderReview()
      await userEvent.click(editButton('Pallet', 1))
      const input = screen.getByRole('textbox')
      await userEvent.clear(input)
      await userEvent.type(input, 'oops{Escape}')
      expect(screen.getByText('P-1')).toBeInTheDocument()
      expect(screen.queryByText('oops')).toBeNull()
    })

    it('can fill in a blank cell', async () => {
      renderReview()
      await userEvent.click(editButton('License Plate', 4))
      await userEvent.type(screen.getByRole('textbox'), 'FILLED1{Enter}')
      expect(screen.getByText('FILLED1')).toBeInTheDocument()
      expect(screen.queryByText(/1 blank/i)).toBeNull()
    })
  })

  it('offers export for this sheet', () => {
    renderReview()
    expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download excel/i })).toBeInTheDocument()
  })
})
