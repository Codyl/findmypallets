import { useState } from 'react'
import type { Storage } from './lib/storage'
import HomeScreen from './components/HomeScreen'
import ScanMode from './components/ScanMode'
import SheetReview from './components/SheetReview'
import { AppProvider } from './state/AppProvider'

type View =
  | { name: 'home' }
  | { name: 'review'; sheetId: string }
  | { name: 'scan' }

export default function App({ storage }: { storage?: Storage }) {
  const [view, setView] = useState<View>({ name: 'home' })
  const goHome = () => setView({ name: 'home' })

  return (
    <AppProvider storage={storage}>
      {view.name === 'review' ? (
        <SheetReview sheetId={view.sheetId} onBack={goHome} />
      ) : view.name === 'scan' ? (
        <ScanMode onBack={goHome} />
      ) : (
        <HomeScreen
          onOpenSheet={(sheetId) => setView({ name: 'review', sheetId })}
          onStartScan={() => setView({ name: 'scan' })}
        />
      )}
    </AppProvider>
  )
}
