// Promise-based potvrda (P2-C4) — zamena za window.confirm.
// Upotreba: const confirm = useConfirm(); if (!(await confirm('Obrisati?'))) return
// Renderuje se kroz ui/Modal pa nasleđuje focus trap / Escape / aria (C2).
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { useT } from '../lang.jsx'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const t = useT()
  const [state, setState] = useState(null) // { message }
  const resolverRef = useRef(null)

  const confirm = useCallback(message => {
    return new Promise(resolve => {
      resolverRef.current = resolve
      setState({ message })
    })
  }, [])

  const close = result => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setState(null)
  }

  const btn = {
    padding: '7px 16px', borderRadius: 8, fontFamily: "'Hanken Grotesk', sans-serif",
    fontWeight: 600, fontSize: 13, cursor: 'pointer',
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} label={t('confirm.title')} maxWidth={420}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {state?.message}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={() => close(false)} style={{ ...btn, background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)' }}>
              {t('confirm.cancel')}
            </button>
            <button onClick={() => close(true)} style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }}>
              {t('confirm.ok')}
            </button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  // Bez providera — fallback na native confirm da funkcionalnost ne nestane
  return ctx || (msg => Promise.resolve(window.confirm(msg)))
}
