import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import { initialState, reducer, type Action, type AppState } from './reducer'

interface AppContextValue {
  state: AppState
  dispatch: Dispatch<Action>
}

const AppContext = createContext<AppContextValue | null>(null)

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

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}
