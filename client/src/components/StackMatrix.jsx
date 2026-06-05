import { useState, useMemo } from 'react'
import { fmtHours } from '../utils.js'
import { buildStackMatrix } from '../utils/stacks.js'

const STACK_COLORS = {
  Backend: 'var(--accent)',
  Frontend: '#8B5CF6',
  Testing: 'var(--amber)',
  Ostalo: 'var(--textSubtle)',
}

function ratioColor(plan, spent) {
  if (plan <= 0) return spent > 0 ? 'var(--amber)' : 'var(--textSubtle)'
  const r = spent / plan
  if (r > 1.15) return 'var(--red)'
  if (r >= 1) return 'var(--amber)'
  return 'var(--green)'
}

function Cell({ plan, spent }) {
  if (plan === 0 && spent === 0) {
    return <div style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--textSubtle)', fontFamily: "'DM Mono'", fontSize: 12 }}>–</div>
  }
  const color = ratioColor(plan, spent)
  const barPct = plan > 0 ? Math.min(spent / plan, 1) * 100 : (spent > 0 ? 100 : 0)
  return (
    <div style={{ padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
        <span style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--text)' }}>{fmtHours(plan)}</span>
        <span style={{ fontFamily: "'DM Mono'", fontSize: 12, color, fontWeight: 600 }}>{fmtHours(spent)}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
        <div style={{ width: `${barPct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

export default function StackMatrix({ tasks, phases }) {
  const [showOstalo, setShowOstalo] = useState(false)
  const m = useMemo(() => buildStackMatrix(tasks || [], phases || []), [tasks, phases])

  const cols = `minmax(150px, 1.4fr) repeat(${m.stacks.length}, 1fr) 1fr`
  const headerCellStyle = { padding: '8px 10px', fontFamily: 'Syne', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Title */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Stekovi — Plan vs Utrošeno po fazama</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>
            Plan (estimacija) · <span style={{ color: 'var(--text)' }}>Utrošeno</span> — atribucija po komponenti subtaska
          </div>
        </div>
        <div style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--textMuted)' }}>
          Σ {fmtHours(m.grand.plan)} plan · <span style={{ color: 'var(--text)' }}>{fmtHours(m.grand.spent)} utroš</span>
        </div>
      </div>

      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--surfaceAlt)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ ...headerCellStyle, color: 'var(--textMuted)' }}>Faza</div>
        {m.stacks.map(s => (
          <div key={s} style={{ ...headerCellStyle, color: STACK_COLORS[s] || 'var(--textMuted)' }}>{s}</div>
        ))}
        <div style={{ ...headerCellStyle, color: 'var(--text)', textAlign: 'right' }}>Ukupno</div>
      </div>

      {/* Phase rows */}
      {m.rows.map((row, i) => (
        <div key={row.phaseId} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--border)', borderTop: i === 0 ? 'none' : undefined }}>
          <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: row.phaseId === 'none' ? 'var(--textMuted)' : 'var(--text)' }}>
            {row.phaseName}
          </div>
          {m.stacks.map(s => <Cell key={s} plan={row.cells[s].plan} spent={row.cells[s].spent} />)}
          <Cell plan={row.total.plan} spent={row.total.spent} />
        </div>
      ))}

      {/* Totals row */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--surfaceAlt)' }}>
        <div style={{ padding: '8px 10px', fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center' }}>Ukupno</div>
        {m.stacks.map(s => <Cell key={s} plan={m.colTotals[s].plan} spent={m.colTotals[s].spent} />)}
        <Cell plan={m.grand.plan} spent={m.grand.spent} />
      </div>

      {/* "Šta je u Ostalo" */}
      {m.ostalo.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowOstalo(v => !v)}
            style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ transform: showOstalo ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▸</span>
            Šta je u „Ostalo" ({m.ostalo.length} {m.ostalo.length === 1 ? 'komponenta' : 'komponenti'}) — za naknadno peglanje
          </button>
          {showOstalo && (
            <div style={{ padding: '0 16px 12px' }}>
              {m.ostalo.map(o => (
                <div key={o.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--border)', fontFamily: "'DM Mono'", fontSize: 12 }}>
                  <span style={{ color: 'var(--text)' }}>{o.name}</span>
                  <span style={{ color: 'var(--textMuted)' }}>{fmtHours(o.plan)} plan · {fmtHours(o.spent)} utroš</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
