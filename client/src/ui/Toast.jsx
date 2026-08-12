// Jedan Toast sistem za celu aplikaciju (P2-A4 + C4). Zamena za pomešane
// alert() / inline banere. Upotreba:
//   1) U App.jsx (već urađeno): <ToastProvider> oko aplikacije
//   2) U komponenti: const toast = useToast(); toast.success('Sačuvano')
// aria-live="polite" — screen reader pročita poruku bez otimanja fokusa.
import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

const COLORS = {
  success: 'var(--green)',
  error: 'var(--red)',
  info: 'var(--accent)',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback(id => setToasts(list => list.filter(t => t.id !== id)), [])

  const push = useCallback((kind, text, { duration = 4000 } = {}) => {
    const id = ++idRef.current
    setToasts(list => [...list.slice(-4), { id, kind, text }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const apiRef = useRef({
    success: (text, opts) => push('success', text, opts),
    error: (text, opts) => push('error', text, { duration: 6000, ...opts }),
    info: (text, opts) => push('info', text, opts),
    dismiss,
  })

  return (
    <ToastContext.Provider value={apiRef.current}>
      {children}
      <div aria-live="polite" style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 2000,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380,
      }}>
        {toasts.map(t => (
          <div key={t.id} onClick={() => dismiss(t.id)} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${COLORS[t.kind] || COLORS.info}`,
            borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
            fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, color: 'var(--text)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  // Bez providera (npr. u testu) — bezopasan no-op umesto rušenja
  return ctx || { success: () => {}, error: () => {}, info: () => {}, dismiss: () => {} }
}
