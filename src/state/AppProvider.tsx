import { useMemo, useReducer, type ReactNode } from 'react'
import { AppContext } from './context'
import { initialState, reducer, type AppState } from './reducer'

export function AppProvider({
  children,
  initial = initialState,
}: {
  children: ReactNode
  /** Starting state; tests use this to preload sheets. */
  initial?: AppState
}) {
  const [state, dispatch] = useReducer(reducer, initial)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
