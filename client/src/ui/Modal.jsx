// Zajednički Modal (P2-A4 + C2). Postojeći modali nemaju role="dialog",
// focus trap ni Escape — ova komponenta to daje na jednom mestu:
//  - role="dialog" + aria-modal + aria-label
//  - focus trap (Tab kruži unutar modala)
//  - Escape zatvara; klik na overlay zatvara (opciono)
//  - fokus se vraća na element koji je otvorio modal
import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Ponašanje dijaloga izdvojeno u hook da POSTOJEĆI modali (sa sopstvenim
// izgledom — bottom sheet na mobilnom itd.) dobiju focus trap / Escape /
// vraćanje fokusa BEZ prepravljanja svog JSX-a: panel div dobija
// ref={panelRef} + role="dialog" + aria-modal + aria-label.
export function useDialogBehavior(open, onClose) {
  const panelRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement

    // Inicijalni fokus: prvi fokusabilan element u modalu, ili sam panel
    const panel = panelRef.current
    const first = panel?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null)
      if (!items.length) { e.preventDefault(); return }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Vrati fokus otvaraču (ako još postoji u DOM-u)
      if (openerRef.current?.focus) openerRef.current.focus()
    }
  }, [open, onClose])

  return panelRef
}

export default function Modal({ open, onClose, label, children, maxWidth = 520, closeOnOverlay = true }) {
  const panelRef = useDialogBehavior(open, onClose)

  if (!open) return null

  return (
    <div
      onMouseDown={closeOnOverlay ? e => { if (e.target === e.currentTarget) onClose?.() } : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)', outline: 'none',
        }}
      >
        {children}
      </div>
    </div>
  )
}
