import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Storage } from '../lib/storage'
import { AppContext } from './context'
import {
  initialState,
  reducer,
  type AppState,
  type PersistedState,
} from './reducer'

interface Props {
  children: ReactNode
  /** Starting state; tests use this to preload sheets. */
  initial?: AppState
  /** Where to save sheets and progress. Omit to keep everything in memory. */
  storage?: Storage
  /** Wait this long after the last change before saving. */
  saveDelayMs?: number
}

export function AppProvider({
  children,
  initial = initialState,
  storage,
  saveDelayMs = 300,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initial)
  const [ready, setReady] = useState(!storage)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  // Load saved data once, before anything is shown.
  useEffect(() => {
    if (!storage) return
    let cancelled = false
    storage
      .load()
      .then((data) => {
        if (cancelled) return
        if (data) dispatch({ type: 'load', data })
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [storage])

  const persisted = useMemo<PersistedState>(
    () => ({
      sheets: state.sheets,
      unmatched: state.unmatched,
      scope: state.scope,
    }),
    [state.sheets, state.unmatched, state.scope],
  )

  const pending = useRef<PersistedState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The first state after loading is what is already stored; skip saving it.
  const skipNext = useRef(true)

  const flush = useRef(() => {})
  useEffect(() => {
    flush.current = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const data = pending.current
      pending.current = null
      if (!data || !storage) return
      storage.save(data).then(
        () => setSaveFailed(false),
        () => setSaveFailed(true),
      )
    }
  }, [storage])

  useEffect(() => {
    if (!storage || !ready) return
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    pending.current = persisted
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flush.current(), saveDelayMs)
  }, [persisted, ready, storage, saveDelayMs])

  // Do not lose the last changes when the page is hidden or closed.
  useEffect(() => {
    if (!storage) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush.current()
    }
    const onPageHide = () => flush.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      flush.current()
    }
  }, [storage])

  const value = useMemo(() => ({ state, dispatch }), [state])

  if (!ready) return <p role="status">Loading saved sheets…</p>

  return (
    <AppContext.Provider value={value}>
      {loadFailed && (
        <p role="alert" className="notice warn">
          Couldn’t load your saved sheets in this browser. New work will still
          work, but export before closing.
        </p>
      )}
      {saveFailed && (
        <p role="alert" className="notice warn">
          Couldn’t save your progress in this browser. Export your data before
          closing this page.
        </p>
      )}
      {children}
    </AppContext.Provider>
  )
}
