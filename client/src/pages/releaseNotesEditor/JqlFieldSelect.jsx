import { useState, useEffect, useRef } from 'react'
import { useT } from '../../lang.jsx'

// Type-ahead multi-select for a Jira field (quick-filter building blocks).
export default function JqlFieldSelect({ label, fieldName, values, onChange, op, onOpChange, fetchSuggestions, placeholder }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState([])     // accumulated suggestions (merged across fetches)
  const [loading, setLoading] = useState(false)
  const [emptyReason, setEmptyReason] = useState(null)
  const tRef = useRef(null)
  const mergeIn = list => setOpts(prev => { const m = new Map(prev.map(o => [o.value, o])); for (const o of (list || [])) m.set(o.value, o); return [...m.values()] })
  // Fetch base list on open, then more as the user types — merge so values stay
  // available for local (partial, contains) filtering even after re-typing.
  useEffect(() => {
    if (!open) return undefined
    clearTimeout(tRef.current)
    tRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetchSuggestions(fieldName, q)
        if (Array.isArray(r)) { mergeIn(r); setEmptyReason(null) }
        else { mergeIn(r?.results); setEmptyReason(r?.reason || null) }
      } catch { /* keep what we have */ } finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(tRef.current)
  }, [q, open]) // eslint-disable-line
  const add = v => { const val = String(v).trim(); if (val && !values.includes(val)) onChange([...values, val]); setQ('') }
  const remove = v => onChange(values.filter(x => x !== v))
  const ql = q.trim().toLowerCase()
  const free = opts.filter(o => !values.includes(o.value) && (!ql || `${o.label} ${o.value}`.toLowerCase().includes(ql)))
  return (
    <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, color: 'var(--textMuted)' }}>{label}</span>
        {onOpChange && (
          <select value={op} onChange={e => onOpChange(e.target.value)} title={t('rne.inExcludeTitle')}
            style={{ fontFamily: 'Hanken Grotesk', fontSize: 10, padding: '1px 4px', borderRadius: 5, border: `1px solid ${op === 'not in' ? 'var(--red)' : 'var(--border)'}`, background: 'var(--bg)', color: op === 'not in' ? 'var(--red)' : 'var(--textMuted)', cursor: 'pointer' }}>
            <option value="in">in</option>
            <option value="not in">not in</option>
          </select>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 6px', minHeight: 34, alignItems: 'center' }}>
        {values.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--text)' }}>
            {v}<button onMouseDown={e => { e.preventDefault(); remove(v) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--textMuted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
          onKeyDown={e => { if (e.key === 'Enter' && q.trim()) { e.preventDefault(); add(q) } }}
          placeholder={values.length ? '' : placeholder}
          style={{ flex: '1 1 60px', minWidth: 60, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 12, padding: '2px' }} />
      </div>
      {open && (loading || free.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '8px 10px', fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)' }}>{t('rne.loading')}</div>}
          {!loading && free.map(o => (
            <button key={o.value} onMouseDown={e => { e.preventDefault(); add(o.value) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', padding: '7px 10px', cursor: 'pointer', fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--text)' }}>
              {o.label}
            </button>
          ))}
          {!loading && free.length === 0 && (
            <div style={{ padding: '8px 10px', fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)', lineHeight: 1.5 }}>
              {emptyReason === 'field-not-found'
                ? t('rne.fieldNotFound', { field: fieldName })
                : emptyReason === 'no-values'
                  ? t('rne.fieldNoValues')
                  : t('rne.noSuggestions')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
