import { useState, useMemo } from 'react'
import { fmtHours } from '../utils.js'
import { buildStackTeams, STACKS } from '../utils/stacks.js'

const STACK_COLORS = {
  Backend: 'var(--accent)',
  Frontend: '#8B5CF6',
  Mobile: '#10B981',
  Database: '#0EA5E9',
  Testing: 'var(--amber)',
  Ostalo: 'var(--textSubtle)',
}

export default function TeamRoster({ team, tasks, onAdd, onRemove }) {
  const [adding, setAdding] = useState(null) // stack currently adding to
  const [manual, setManual] = useState('')

  // Jira-derived people per stack with logged hours — used as suggestions.
  const derived = useMemo(() => buildStackTeams(tasks || [], []), [tasks])
  const spentByName = useMemo(() => {
    const m = {}
    for (const p of derived.people) m[p.name] = p.spent
    return m
  }, [derived])

  const byStack = useMemo(() => {
    const o = {}
    for (const s of STACKS) o[s] = []
    for (const m of (team || [])) if (o[m.stack]) o[m.stack].push(m)
    return o
  }, [team])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Tim po steku</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>
          Definiši stalni tim — to određuje kapacitet u proceni. Jira imena su predlog (sa logovanim satima); odbaci ko nije relevantan.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 0 }}>
        {STACKS.map(s => {
          const members = byStack[s]
          const inRoster = new Set(members.map(m => m.name))
          const suggestions = (derived.byStack[s]?.people || []).filter(n => n !== 'Neraspoređeno' && !inRoster.has(n))
          return (
            <div key={s} style={{ borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: STACK_COLORS[s] || 'var(--text)' }}>{s}</span>
                <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>{members.length} {members.length === 1 ? 'osoba' : 'ljudi'}</span>
              </div>

              {/* Current roster chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {members.length === 0 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textSubtle)', fontStyle: 'italic' }}>— nema definisanih</span>}
                {members.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)' }}>{m.name}</span>
                    <button onClick={() => onRemove?.(m.id)} title="Ukloni" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--textSubtle)', fontSize: 13, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Add controls */}
              {adding === s ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Iz Jire</span>
                      {suggestions.map(n => (
                        <button key={n} onClick={() => { onAdd?.(n, s) }}
                          style={{ display: 'flex', justifyContent: 'space-between', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)' }}>
                          <span>+ {n}</span>
                          <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>{fmtHours(spentByName[n] || 0)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={manual} onChange={e => setManual(e.target.value)} placeholder="Ručno ime…"
                      onKeyDown={e => { if (e.key === 'Enter' && manual.trim()) { onAdd?.(manual.trim(), s); setManual('') } if (e.key === 'Escape') { setAdding(null); setManual('') } }}
                      style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: 'none' }} />
                    <button onClick={() => { if (manual.trim()) { onAdd?.(manual.trim(), s); setManual('') } }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Dodaj</button>
                  </div>
                  <button onClick={() => { setAdding(null); setManual('') }} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", alignSelf: 'flex-start' }}>Gotovo</button>
                </div>
              ) : (
                <button onClick={() => setAdding(s)} style={{ background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, width: '100%' }}>
                  + Dodaj u {s}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
