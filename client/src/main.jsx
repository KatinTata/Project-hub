import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme } from './theme.js'
import { LangProvider } from './lang.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ToastProvider } from './ui/Toast.jsx'
import { ConfirmProvider } from './ui/Confirm.jsx'
import App from './App.jsx'

// Apply initial theme before render to avoid flash
const savedTheme = localStorage.getItem('jt_theme') || 'dark'
applyTheme(savedTheme)

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"
const Loading = (
  <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--textMuted)', fontFamily: font }}>
    Učitavam...
  </div>
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider>
      <ErrorBoundary>
        <ToastProvider>
          <ConfirmProvider>
            <Suspense fallback={Loading}>
              <App />
            </Suspense>
          </ConfirmProvider>
        </ToastProvider>
      </ErrorBoundary>
    </LangProvider>
  </StrictMode>
)
