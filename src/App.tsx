import HomeScreen from './components/HomeScreen'
import { AppProvider } from './state/AppProvider'

export default function App() {
  return (
    <AppProvider>
      {/* Review and scan screens are wired in as they are built. */}
      <HomeScreen onOpenSheet={() => {}} onStartScan={() => {}} />
    </AppProvider>
  )
}
