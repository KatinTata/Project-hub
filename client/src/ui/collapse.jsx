import { useState } from 'react'

// Collapsible sekcije sa pamćenjem izbora (P2-C5). Izbor se čuva u
// localStorage po grupi (storageKey) i id-u sekcije; default je otvoreno,
// pa bez interakcije sve izgleda kao pre.

function readMap(storageKey) {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
}

export function useCollapsedSections(storageKey) {
  const [collapsed, setCollapsed] = useState(() => readMap(storageKey))
  function toggle(id) {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* best-effort */ }
      return next
    })
  }
  return { collapsed, toggle }
}

// Chevron dugme za zaglavlje sekcije — aria-expanded za čitače ekrana.
export function CollapseToggle({ open, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      aria-label={label || 'Prikaži/sakrij sekciju'}
      title={label || 'Prikaži/sakrij sekciju'}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px',
        color: 'var(--textMuted)', fontSize: 12, lineHeight: 1, flexShrink: 0,
        transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s',
      }}
    >▾</button>
  )
}
