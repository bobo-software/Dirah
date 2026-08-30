import { createRoot } from 'react-dom/client'
import '@toeverything/theme/style.css'
import './index.css'
import App from './App.tsx'

// StrictMode double-mounts effects, which opens two y-indexeddb connections
// for the same page and stacked empty BlockSuite roots.
createRoot(document.getElementById('root')!).render(<App />)
