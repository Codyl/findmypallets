import { useEffect, useRef, type KeyboardEvent } from 'react'

interface Props {
  onScan: (value: string) => void
  /** While true the field leaves focus alone (for example behind a dialog). */
  paused?: boolean
}

function isTextEntry(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable
  )
}

/**
 * The field a keyboard-wedge scanner types into. It stays focused, hides the
 * on-screen keyboard, and reports each scan when the scanner sends Enter.
 */
export default function ScanInput({ onScan, paused = false }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  // Take focus on mount and whenever un-paused.
  useEffect(() => {
    if (!paused) ref.current?.focus()
  }, [paused])

  // If scanner keys arrive while a button or the page body has focus, bring
  // focus back to the field so the scan is not lost.
  useEffect(() => {
    if (paused) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.length !== 1 || event.key === ' ') return
      if (isTextEntry(event.target)) return
      ref.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [paused])

  const submit = () => {
    const input = ref.current
    if (!input) return false
    const value = input.value.trim()
    input.value = ''
    if (value === '') return false
    onScan(value)
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'Tab' && event.currentTarget.value.trim() !== '') {
      // Some scanners end a scan with Tab instead of Enter.
      event.preventDefault()
      submit()
    }
  }

  return (
    <input
      ref={ref}
      type="text"
      className="scan-input"
      aria-label="Scan a license plate"
      placeholder="Ready to scan…"
      inputMode="none"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Only reclaim focus when it went nowhere (e.g. a tap on blank space).
        if (paused || event.relatedTarget !== null) return
        setTimeout(() => ref.current?.focus(), 0)
      }}
    />
  )
}
