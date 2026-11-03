import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../state/AppProvider'
import { initialState, type AppState } from '../state/reducer'
import type { Sheet } from '../lib/types'
import type { Feedback } from '../lib/feedback'
import ScanMode from './ScanMode'

const sheetA: Sheet = {
  id: 'a',
  name: 'Dock A',
  source: 'excel',
  headers: ['Plate', 'Pallet'],
  rows: [
    ['ABC123', 'P-1'],
    ['XYZ789', 'P-2'],
    ['LMN456', 'P-3'],
  ],
  matchColumn: 0,
  found: {},
}

const sheetB: Sheet = {
  id: 'b',
  name: 'Dock B',
  source: 'excel',
  headers: ['Pallet', 'Plate'],
  rows: [
    ['P-9', 'ABC123'],
    ['P-8', 'ONLYB'],
  ],
  matchColumn: 1,
  found: {},
}

function setup(sheets: Sheet[] = [sheetA, sheetB], extra: Partial<AppState> = {}) {
  const feedback: Feedback = {
    unlock: vi.fn(async () => {}),
    play: vi.fn(),
  }
  const onBack = vi.fn()
  render(
    <AppProvider initial={{ ...initialState, sheets, ...extra }}>
      <ScanMode onBack={onBack} feedback={feedback} />
    </AppProvider>,
  )
  return { feedback, onBack }
}

async function start() {
  await userEvent.click(screen.getByRole('button', { name: /start scanning/i }))
}

async function scan(value: string) {
  await userEvent.keyboard(`${value}{Enter}`)
}

const result = () => screen.getByRole('status', { name: /scan result/i })

describe('ScanMode', () => {
  it('needs a tap to start, which unlocks sound', async () => {
    const { feedback } = setup()
    expect(screen.queryByRole('textbox', { name: /scan a license plate/i })).toBeNull()

    await start()

    expect(feedback.unlock).toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: /scan a license plate/i }),
    ).toHaveFocus()
  })

  it('goes back', async () => {
    const { onBack } = setup()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  describe('a matching scan', () => {
    it('shows the matched row, updates the counter and plays the match sound', async () => {
      const { feedback } = setup([sheetA])
      expect(screen.getByText('0 of 3 found')).toBeInTheDocument()
      await start()
      await scan('XYZ789')

      const card = result()
      expect(card).toHaveAttribute('data-kind', 'match')
      expect(within(card).getByText('Match')).toBeInTheDocument()
      expect(within(card).getAllByText('XYZ789').length).toBeGreaterThan(0)
      expect(within(card).getByText('Pallet')).toBeInTheDocument()
      expect(within(card).getByText('P-2')).toBeInTheDocument()
      expect(screen.getByText('1 of 3 found')).toBeInTheDocument()
      expect(feedback.play).toHaveBeenCalledWith('match')
      expect(feedback.play).toHaveBeenCalledTimes(1)
    })

    it('names the sheet for every hit when a plate is in several sheets', async () => {
      setup()
      await start()
      await scan('ABC123')

      const card = result()
      expect(within(card).getByText('Dock A')).toBeInTheDocument()
      expect(within(card).getByText('Dock B')).toBeInTheDocument()
      expect(screen.getByText('2 of 5 found')).toBeInTheDocument()
    })
  })

  describe('a repeated scan', () => {
    it('says it was already scanned and plays the already sound', async () => {
      const { feedback } = setup([sheetA])
      await start()
      await scan('ABC123')
      await scan('ABC123')

      const card = result()
      expect(card).toHaveAttribute('data-kind', 'already')
      expect(within(card).getByText('Already scanned')).toBeInTheDocument()
      expect(within(card).getByText(/first scanned/i)).toBeInTheDocument()
      expect(feedback.play).toHaveBeenLastCalledWith('already')
      expect(screen.getByText('1 of 3 found')).toBeInTheDocument()
    })
  })

  describe('a scan with no match', () => {
    it('says no match, plays the miss sound and lists it', async () => {
      const { feedback } = setup([sheetA])
      await start()
      await scan('NOPE999')

      const card = result()
      expect(card).toHaveAttribute('data-kind', 'none')
      expect(within(card).getByText('No match')).toBeInTheDocument()
      expect(within(card).getByText('NOPE999')).toBeInTheDocument()
      expect(feedback.play).toHaveBeenCalledWith('none')

      const log = screen.getByRole('region', { name: /unmatched scans/i })
      expect(within(log).getByText('NOPE999')).toBeInTheDocument()
      expect(screen.getByText(/unmatched scans \(1\)/i)).toBeInTheDocument()
    })
  })

  describe('scope', () => {
    it('searches all sheets by default and can be limited to one', async () => {
      setup()
      await start()
      const select = screen.getByLabelText(/search in/i)
      expect(select).toHaveDisplayValue('All sheets')

      await userEvent.selectOptions(select, 'Dock A')
      expect(screen.getByText('0 of 3 found')).toBeInTheDocument()

      await scan('ONLYB')
      expect(result()).toHaveAttribute('data-kind', 'none')

      await userEvent.selectOptions(select, 'All sheets')
      await scan('ONLYB')
      expect(result()).toHaveAttribute('data-kind', 'match')
    })

    it('clears the previous result when the scope changes', async () => {
      setup()
      await start()
      await scan('ABC123')
      expect(result()).toBeInTheDocument()

      await userEvent.selectOptions(screen.getByLabelText(/search in/i), 'Dock B')
      expect(screen.queryByRole('status', { name: /scan result/i })).toBeNull()
    })

    it('keeps the scan field focused after changing scope', async () => {
      setup()
      await start()
      await userEvent.selectOptions(screen.getByLabelText(/search in/i), 'Dock B')
      await userEvent.keyboard('ONLYB{Enter}')
      expect(result()).toHaveAttribute('data-kind', 'match')
    })
  })

  describe('sheets without a plate column', () => {
    it('warns about skipped sheets', async () => {
      setup([sheetA, { ...sheetB, matchColumn: null }])
      expect(screen.getByText(/1 sheet skipped/i)).toHaveTextContent('Dock B')
      expect(screen.getByText('0 of 3 found')).toBeInTheDocument()
    })

    it('explains when nothing can be scanned and plays the miss sound', async () => {
      const { feedback } = setup([{ ...sheetA, matchColumn: null }])
      expect(screen.getByText(/no sheets are ready to scan/i)).toBeInTheDocument()
      await start()
      await scan('ABC123')
      expect(result()).toHaveAttribute('data-kind', 'no-sheets')
      expect(feedback.play).toHaveBeenCalledWith('none')
    })
  })

  it('does not play a sound just because a result already exists on screen', () => {
    const { feedback } = setup([sheetA], {
      lastScan: { kind: 'none', value: 'OLD' },
    })
    expect(feedback.play).not.toHaveBeenCalled()
  })

  describe('clearing unmatched scans', () => {
    const withUnmatched = {
      unmatched: [
        { value: 'BAD1', scannedAt: '2026-11-02T20:00:00.000Z', scope: 'All sheets' },
        { value: 'BAD2', scannedAt: '2026-11-02T20:01:00.000Z', scope: 'All sheets' },
      ],
    }

    it('clears the list after confirming', async () => {
      setup([sheetA], withUnmatched)
      await userEvent.click(screen.getByRole('button', { name: /clear unmatched scans/i }))
      const dialog = screen.getByRole('dialog', { name: /clear unmatched scans\?/i })
      await userEvent.click(within(dialog).getByRole('button', { name: /^clear$/i }))

      expect(screen.queryByText('BAD1')).toBeNull()
      expect(screen.queryByRole('region', { name: /unmatched scans/i })).toBeNull()
    })

    it('keeps the list when cancelled', async () => {
      setup([sheetA], withUnmatched)
      await userEvent.click(screen.getByRole('button', { name: /clear unmatched scans/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByText('BAD1')).toBeInTheDocument()
    })

    it('keeps the scan field working after the dialog closes', async () => {
      setup([sheetA], withUnmatched)
      await start()
      await userEvent.click(screen.getByRole('button', { name: /clear unmatched scans/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.keyboard('ABC123{Enter}')
      expect(result()).toHaveAttribute('data-kind', 'match')
    })
  })
})
