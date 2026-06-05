import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme } from './theme.js'
import { LangProvider } from './lang.jsx'
import App from './App.jsx'

// Apply initial theme before render to avoid flash
const savedTheme = localStorage.getItem('jt_theme') || 'dark'
applyTheme(savedTheme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>
)
