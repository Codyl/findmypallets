import { useState } from 'react'
import HomeScreen from './components/HomeScreen'
import SheetReview from './components/SheetReview'
import { AppProvider } from './state/AppProvider'

type View = { name: 'home' } | { name: 'review'; sheetId: string }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const goHome = () => setView({ name: 'home' })

  return (
    <AppProvider>
      {view.name === 'review' ? (
        <SheetReview sheetId={view.sheetId} onBack={goHome} />
      ) : (
        <HomeScreen
          onOpenSheet={(sheetId) => setView({ name: 'review', sheetId })}
          // Scan mode is wired in with Task 11.
          onStartScan={() => {}}
        />
      )}
    </AppProvider>
  )
}
