import { useEffect, useId, useRef } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** An extra button that does not close the dialog, such as "Export first". */
  secondary?: { label: string; onClick: () => void }
  error?: string | null
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  secondary,
  error,
}: Props) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Start on the safe choice so a stray Enter from a scanner cannot confirm.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal">
        <h2 id={titleId}>{title}</h2>
        <p>{message}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
          {secondary && (
            <button type="button" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
