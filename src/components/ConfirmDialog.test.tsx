import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from './ConfirmDialog'

function setup(extra: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      title="Delete Dock A?"
      message="This removes the sheet and its progress."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...extra}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('shows the title and message in an accessible dialog', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Delete Dock A?' })
    expect(dialog).toHaveTextContent('This removes the sheet and its progress.')
  })

  it('puts focus on Cancel so a stray Enter does not destroy data', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape', async () => {
    const { onCancel, onConfirm } = setup()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('can offer an extra action without closing', async () => {
    const onClick = vi.fn()
    const { onCancel, onConfirm } = setup({
      secondary: { label: 'Export first', onClick },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Export first' }))
    expect(onClick).toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows an error from the extra action', () => {
    setup({
      secondary: { label: 'Export first', onClick: vi.fn() },
      error: 'Export failed.',
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Export failed.')
  })
})
