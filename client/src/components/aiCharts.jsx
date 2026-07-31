// Pure-SVG chart kit for the AI usage dashboard (no chart libraries).

export const SERIES = ['#2563EB', '#0EA5E9', '#7C3AED', '#16A34A', '#EA580C', '#DC2626', '#0D9488', '#D97706', '#8B5CF6', '#059669', '#DB2777', '#64748B']
export const colorAt = i => SERIES[i % SERIES.length]

export const fmtTok = n => {
  const v = Number(n) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
  return String(Math.round(v))
}
export const fmtNum = n => (Number(n) || 0).toLocaleString('sr-RS')
export const fmtMoney = (v, cur = 'USD') => {
  if (v == null) return '—'
  const n = Number(v) || 0
  const s = n >= 1000 ? n.toFixed(0) : n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4)
  return cur === 'USD' ? '$' + s : cur === 'EUR' ? s + ' €' : s + ' ' + cur
}

// ── Donut / pie with legend ───────────────────────────────────────────────────
export function PieChart({ data, size = 170, thickness = 26, centerLabel, centerValue, valueFmt = v => v, max = 8 }) {
  const rows = (data || []).filter(d => (d.value || 0) > 0)
  const total = rows.reduce((s, d) => s + d.value, 0)
  if (!total) return <div style={{ padding: 18, color: 'var(--textSubtle)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>Nema podataka</div>

  const top = rows.slice(0, max)
  const restVal = rows.slice(max).reduce((s, d) => s + d.value, 0)
  const segs = restVal > 0 ? [...top, { label: 'Ostalo', value: restVal }] : top

  const r = (size - thickness) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {segs.map((d, i) => {
          const pct = d.value / total
          const len = circ * pct
          const el = (
            <circle key={i} cx={c} cy={c} r={r} fill="none"
              stroke={d.color || colorAt(i)} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 2)} ${circ}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`} strokeLinecap="butt">
              <title>{`${d.label}: ${valueFmt(d.value)} (${Math.round(pct * 100)}%)`}</title>
            </circle>
          )
          offset += len
          return el
        })}
        {(centerValue != null || centerLabel) && (
          <>
            <text x={c} y={c - 2} textAnchor="middle" fontFamily="Hanken Grotesk" fontWeight="800" fontSize="17" fill="var(--text)">{centerValue}</text>
            <text x={c} y={c + 15} textAnchor="middle" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10" fill="var(--textMuted)">{centerLabel}</text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 150, flex: 1 }}>
        {segs.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color || colorAt(i), flexShrink: 0 }} />
            <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={d.label}>{d.label}</span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>{Math.round(d.value / total * 100)}%</span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--text)', minWidth: 54, textAlign: 'right' }}>{valueFmt(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Horizontal bars (top-N ranking) ───────────────────────────────────────────
export function HBars({ data, valueFmt = v => v, max = 10, color }) {
  const rows = (data || []).filter(d => (d.value || 0) > 0).slice(0, max)
  if (!rows.length) return <div style={{ padding: 18, color: 'var(--textSubtle)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>Nema podataka</div>
  const peak = Math.max(...rows.map(d => d.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((d, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', flexShrink: 0 }}>{valueFmt(d.value)}</span>
          </div>
          <div style={{ height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(d.value / peak) * 100}%`, height: '100%', background: color || colorAt(i), transition: 'width 0.4s ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Daily trend: cost line + request bars ─────────────────────────────────────
export function TrendChart({ days, currency = 'USD', height = 220 }) {
  const rows = days || []
  if (!rows.length) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>Nema podataka za period</div>
  const W = 900, padL = 58, padR = 56, padT = 12, padB = 28
  const plotW = W - padL - padR, plotH = height - padT - padB
  const maxCost = Math.max(1e-6, ...rows.map(d => d.cost || 0))
  const maxReq = Math.max(1, ...rows.map(d => d.requests || 0))
  const bw = Math.max(2, Math.min(20, plotW / rows.length - 3))
  const x = i => padL + (rows.length === 1 ? plotW / 2 : plotW * i / (rows.length - 1))
  const yCost = v => padT + plotH - (v / maxCost) * plotH
  const pts = rows.map((d, i) => `${x(i).toFixed(1)},${yCost(d.cost || 0).toFixed(1)}`).join(' ')
  const area = `${padL},${padT + plotH} ${pts} ${padL + plotW},${padT + plotH}`
  const step = Math.max(1, Math.ceil(rows.length / 10))
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 3, background: '#2563EB', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />Trošak ({currency})</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: 'rgba(14,165,233,0.45)', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />Zahtevi</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={padL} y1={padT + plotH * t} x2={W - padR} y2={padT + plotH * t} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 7} y={padT + plotH * t + 4} textAnchor="end" fontFamily="Hanken Grotesk" fontSize="9.5" fill="var(--textMuted)">{fmtMoney(maxCost * (1 - t), currency)}</text>
            <text x={W - padR + 7} y={padT + plotH * t + 4} textAnchor="start" fontFamily="Hanken Grotesk" fontSize="9.5" fill="var(--textMuted)">{fmtTok(maxReq * (1 - t))}</text>
          </g>
        ))}
        {rows.map((d, i) => {
          const h = ((d.requests || 0) / maxReq) * plotH
          return <rect key={i} x={x(i) - bw / 2} y={padT + plotH - h} width={bw} height={h} fill="rgba(14,165,233,0.35)" rx="1.5">
            <title>{`${d.date}: ${fmtNum(d.requests)} zahteva · ${fmtMoney(d.cost, currency)}`}</title>
          </rect>
        })}
        <polygon points={area} fill="rgba(37,99,235,0.10)" />
        <polyline points={pts} fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {rows.map((d, i) => (i % step === 0 || i === rows.length - 1) && (
          <text key={d.date} x={x(i)} y={height - 8} textAnchor="middle" fontFamily="Hanken Grotesk" fontSize="9.5" fill="var(--textMuted)">{String(d.date).slice(5)}</text>
        ))}
      </svg>
    </div>
  )
}

// ── Budget gauge ──────────────────────────────────────────────────────────────
export function BudgetGauge({ name, spent, limit, pct, level }) {
  const color = level === 'limit' ? 'var(--red)' : level === 'warning' ? 'var(--amber)' : 'var(--green)'
  const p = Math.min(100, Math.max(0, Math.round(pct || 0)))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
        <span style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color }}>{fmtMoney(spent, 'EUR')} / {fmtMoney(limit, 'EUR')} · {p}%</span>
      </div>
      <div style={{ height: 9, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}
