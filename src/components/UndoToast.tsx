import { useEffect } from 'react'

export const UNDO_MS = 8000

interface Props {
  message: string
  onUndo: () => void
  onExpire: () => void
  durationMs?: number
}

/** A short-lived "Deleted X · Undo" bar. */
export default function UndoToast({
  message,
  onUndo,
  onExpire,
  durationMs = UNDO_MS,
}: Props) {
  useEffect(() => {
    const timer = setTimeout(onExpire, durationMs)
    return () => clearTimeout(timer)
  }, [onExpire, durationMs])

  return (
    <div role="status" aria-label="Undo delete" className="toast">
      <span>{message}</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
