import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Storage } from '../lib/storage'
import type { Sheet } from '../lib/types'
import { AppProvider } from './AppProvider'
import { useApp } from './context'
import type { PersistedState } from './reducer'

const sheet = (id: string): Sheet => ({
  id,
  name: `Sheet ${id}`,
  source: 'excel',
  headers: ['Plate'],
  rows: [['A']],
  matchColumn: 0,
  found: {},
})

function Probe() {
  const { state, dispatch } = useApp()
  return (
    <div>
      <p>sheets: {state.sheets.map((s) => s.id).join(',') || 'none'}</p>
      <button
        onClick={() =>
          dispatch({ type: 'add-sheets', sheets: [sheet(`n${state.sheets.length}`)] })
        }
      >
        add
      </button>
      <button onClick={() => dispatch({ type: 'scan', value: 'A', now: new Date() })}>
        scan
      </button>
      <button onClick={() => dispatch({ type: 'clear-all' })}>clear</button>
    </div>
  )
}

function makeStorage(
  initial: PersistedState | null,
  overrides: Partial<Storage> = {},
) {
  const storage = {
    load: vi.fn(async () => initial),
    save: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    ...overrides,
  }
  return storage as Storage & {
    load: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
}

const saved: PersistedState = {
  sheets: [sheet('saved')],
  unmatched: [],
  scope: { kind: 'all' },
}

describe('AppProvider persistence', () => {
  it('renders immediately when there is no storage', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    expect(screen.getByText('sheets: none')).toBeInTheDocument()
  })

  it('shows loading, then the saved sheets', async () => {
    let finish: (value: PersistedState | null) => void = () => {}
    const storage = makeStorage(null, {
      load: () => new Promise((resolve) => (finish = resolve)),
    })
    render(
      <AppProvider storage={storage}>
        <Probe />
      </AppProvider>,
    )
    expect(screen.getByText(/loading saved sheets/i)).toBeInTheDocument()
    expect(screen.queryByText(/sheets:/)).toBeNull()

    await act(async () => finish(saved))

    expect(await screen.findByText('sheets: saved')).toBeInTheDocument()
    expect(screen.queryByText(/loading saved sheets/i)).toBeNull()
  })

  it('starts empty when nothing was saved', async () => {
    render(
      <AppProvider storage={makeStorage(null)}>
        <Probe />
      </AppProvider>,
    )
    expect(await screen.findByText('sheets: none')).toBeInTheDocument()
  })

  it('does not write anything just from loading', async () => {
    const storage = makeStorage(saved)
    render(
      <AppProvider storage={storage} saveDelayMs={0}>
        <Probe />
      </AppProvider>,
    )
    await screen.findByText('sheets: saved')
    await new Promise((r) => setTimeout(r, 30))
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('saves after a change, without the transient scan result', async () => {
    const storage = makeStorage(saved)
    render(
      <AppProvider storage={storage} saveDelayMs={0}>
        <Probe />
      </AppProvider>,
    )
    await screen.findByText('sheets: saved')
    await userEvent.click(screen.getByRole('button', { name: 'scan' }))

    await waitFor(() => expect(storage.save).toHaveBeenCalled())
    const data = storage.save.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(Object.keys(data).sort()).toEqual(['scope', 'sheets', 'unmatched'])
    expect((data.sheets as Sheet[])[0].found[0]).toBeDefined()
  })

  it('combines rapid changes into one save', async () => {
    const storage = makeStorage(saved)
    render(
      <AppProvider storage={storage} saveDelayMs={40}>
        <Probe />
      </AppProvider>,
    )
    await screen.findByText('sheets: saved')
    await userEvent.click(screen.getByRole('button', { name: 'add' }))
    await userEvent.click(screen.getByRole('button', { name: 'add' }))
    await waitFor(() => expect(storage.save).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 80))
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect((storage.save.mock.calls[0][0] as PersistedState).sheets).toHaveLength(3)
  })

  it('saves right away when the page is hidden', async () => {
    const storage = makeStorage(saved)
    render(
      <AppProvider storage={storage} saveDelayMs={60_000}>
        <Probe />
      </AppProvider>,
    )
    await screen.findByText('sheets: saved')
    await userEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(storage.save).not.toHaveBeenCalled()

    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    if (original) Object.defineProperty(Document.prototype, 'visibilityState', original)

    await waitFor(() => expect(storage.save).toHaveBeenCalledTimes(1))
  })

  it('saves an emptied state after clear-all', async () => {
    const storage = makeStorage(saved)
    render(
      <AppProvider storage={storage} saveDelayMs={0}>
        <Probe />
      </AppProvider>,
    )
    await screen.findByText('sheets: saved')
    await userEvent.click(screen.getByRole('button', { name: 'clear' }))
    await waitFor(() => expect(storage.save).toHaveBeenCalled())
    expect((storage.save.mock.calls.at(-1)![0] as PersistedState).sheets).toEqual([])
  })

  it('warns when saving fails but keeps working', async () => {
    const storage = makeStorage(saved, {
      save: vi.fn(async () => {
        throw new Error('quota')
      }),
    })
    render(
      <AppProvider storage={storage} saveDelayMs={0}>
        <Probe />
      </AppProvider>,
    )
    await screen.findByText('sheets: saved')
    await userEvent.click(screen.getByRole('button', { name: 'add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i)
    expect(screen.getByText(/sheets: saved,n1/)).toBeInTheDocument()
  })

  it('warns when saved data cannot be loaded, and does not overwrite it unprompted', async () => {
    const storage = makeStorage(null, {
      load: vi.fn(async () => {
        throw new Error('blocked')
      }),
    })
    render(
      <AppProvider storage={storage} saveDelayMs={0}>
        <Probe />
      </AppProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load/i)
    expect(screen.getByText('sheets: none')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 30))
    expect(storage.save).not.toHaveBeenCalled()
  })
})
