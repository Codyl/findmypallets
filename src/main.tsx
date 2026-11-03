import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createIdbStorage } from './lib/storage'

const storage = createIdbStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App storage={storage} />
  </StrictMode>,
)
