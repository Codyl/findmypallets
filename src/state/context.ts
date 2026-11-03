import { createContext, useContext, type Dispatch } from 'react'
import type { Action, AppState } from './reducer'

export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<Action>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}
