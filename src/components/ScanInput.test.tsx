import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScanInput from './ScanInput'

const input = () => screen.getByRole('textbox', { name: /scan a license plate/i })

describe('ScanInput', () => {
  it('is focused on mount and keeps the phone keyboard hidden', () => {
    render(<ScanInput onScan={vi.fn()} />)
    expect(input()).toHaveFocus()
    expect(input()).toHaveAttribute('inputmode', 'none')
    expect(input()).toHaveAttribute('autocomplete', 'off')
  })

  it('sends the trimmed value on Enter and clears the field', async () => {
    const onScan = vi.fn()
    render(<ScanInput onScan={onScan} />)
    await userEvent.keyboard('  ABC123 {Enter}')
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('ABC123')
    expect(input()).toHaveValue('')
  })

  it('handles several scans in a row', async () => {
    const onScan = vi.fn()
    render(<ScanInput onScan={onScan} />)
    await userEvent.keyboard('AAA{Enter}BBB{Enter}')
    expect(onScan.mock.calls).toEqual([['AAA'], ['BBB']])
  })

  it('ignores Enter when nothing was typed', async () => {
    const onScan = vi.fn()
    render(<ScanInput onScan={onScan} />)
    await userEvent.keyboard('{Enter}   {Enter}')
    expect(onScan).not.toHaveBeenCalled()
    expect(input()).toHaveValue('')
  })

  it('treats a Tab suffix from the scanner as the end of a scan', async () => {
    const onScan = vi.fn()
    render(<ScanInput onScan={onScan} />)
    await userEvent.keyboard('ABC123{Tab}')
    expect(onScan).toHaveBeenCalledWith('ABC123')
    expect(input()).toHaveFocus()
  })

  it('takes focus back when it is lost to nothing', async () => {
    render(<ScanInput onScan={vi.fn()} />)
    input().blur()
    await waitFor(() => expect(input()).toHaveFocus())
  })

  it('does not steal focus from a button the user pressed', async () => {
    render(
      <>
        <button type="button">Other</button>
        <ScanInput onScan={vi.fn()} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByRole('button', { name: 'Other' })).toHaveFocus()
  })

  it('moves focus back to the field when scanner keys arrive elsewhere', async () => {
    const onScan = vi.fn()
    render(
      <>
        <button type="button">Other</button>
        <ScanInput onScan={onScan} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    expect(screen.getByRole('button', { name: 'Other' })).toHaveFocus()

    await userEvent.keyboard('Z')
    expect(input()).toHaveFocus()
  })

  it('leaves other text fields alone', async () => {
    render(
      <>
        <label>
          Other field
          <input />
        </label>
        <ScanInput onScan={vi.fn()} />
      </>,
    )
    await userEvent.click(screen.getByLabelText('Other field'))
    await userEvent.keyboard('hello')
    expect(screen.getByLabelText('Other field')).toHaveValue('hello')
    expect(screen.getByLabelText('Other field')).toHaveFocus()
  })

  it('does not grab focus while paused', async () => {
    render(<ScanInput onScan={vi.fn()} paused />)
    expect(input()).not.toHaveFocus()
    await userEvent.keyboard('Z')
    expect(input()).not.toHaveFocus()
  })

  it('does not treat shortcuts as scanner input', async () => {
    render(
      <>
        <button type="button">Other</button>
        <ScanInput onScan={vi.fn()} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    await userEvent.keyboard('{Control>}c{/Control}')
    expect(screen.getByRole('button', { name: 'Other' })).toHaveFocus()
  })
})
