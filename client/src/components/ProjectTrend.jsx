import { useState, useEffect } from 'react'
import { api } from '../api.js'

const PAL = { accent: '#2563EB', green: '#16A34A', red: '#DC2626', muted: '#5A6480', border: '#E2E6F0' }

function niceCeil(v) {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const f = v / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * base
}
const fmtDay = iso => { const [, m, d] = (iso || '').split('-'); return d && m ? `${d}.${m}.` : iso }

function LineChart({ snaps, series, width = 760, height = 150, yMax, yFmt }) {
  const padL = 40, padR = 12, padT = 10, padB = 26
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const n = snaps.length
  const max = yMax != null ? yMax : niceCeil(Math.max(1, ...series.flatMap(s => snaps.map(s.value))))
  const x = i => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1))
  const y = v => padT + plotH - (Math.min(v, max) / max) * plotH

  const ticks = 3
  let grid = ''
  for (let i = 0; i <= ticks; i++) {
    const val = (max * i) / ticks
    const yy = padT + plotH - (val / max) * plotH
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${width - padR}" y2="${yy.toFixed(1)}" stroke="${PAL.border}" stroke-width="1"/>`
    grid += `<text x="${padL - 6}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-family="DM Mono, monospace" font-size="10" fill="${PAL.muted}">${yFmt ? yFmt(val) : Math.round(val)}</text>`
  }

  let xlabels = ''
  const step = Math.max(1, Math.ceil(n / 6))
  snaps.forEach((s, i) => {
    if (i % step === 0 || i === n - 1) {
      xlabels += `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-family="DM Mono, monospace" font-size="10" fill="${PAL.muted}">${fmtDay(s.day)}</text>`
    }
  })

  let paths = ''
  for (const s of series) {
    const pts = snaps.map((snap, i) => `${x(i).toFixed(1)},${y(s.value(snap)).toFixed(1)}`).join(' ')
    paths += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="5 4"` : ''}/>`
    paths += snaps.map((snap, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s.value(snap)).toFixed(1)}" r="2.2" fill="${s.color}"/>`).join('')
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">${grid}${paths}${xlabels}</svg>`
}

const H = sec => (sec || 0) / 3600
const donePctOf = s => (s.total > 0 ? (s.done / s.total) * 100 : 0)

export default function ProjectTrend({ projectId }) {
  const [snaps, setSnaps] = useState(null)

  useEffect(() => {
    if (typeof projectId !== 'number') { setSnaps([]); return }
    api.getSnapshots(projectId).then(s => setSnaps(s || [])).catch(() => setSnaps([]))
  }, [projectId])

  if (!snaps) return <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Učitavam trend…</div>

  if (snaps.length < 2) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
        📈 Trend se gradi iz dnevnih snapshot-a (beleže se pri svakom „Osveži").<br />
        Treba bar <strong>2 različita dana</strong> podataka — vrati se sutra pa će biti grafika.
        {snaps.length === 1 && <div style={{ marginTop: 6, fontSize: 12 }}>Zabeležen 1 dan ({fmtDay(snaps[0].day)}).</div>}
      </div>
    )
  }

  const first = snaps[0], last = snaps[snaps.length - 1]
  const spanDays = Math.max(1, Math.round((new Date(last.day) - new Date(first.day)) / 86400000))

  const donePctDelta = Math.round(donePctOf(last) - donePctOf(first))
  const doneDelta = (last.done || 0) - (first.done || 0)
  const velWeek = (doneDelta / spanDays) * 7
  const burnedH = H(last.totalSpent) - H(first.totalSpent)
  const burnPerDay = burnedH / spanDays
  const scopeDelta = (last.total || 0) - (first.total || 0)

  // Velocity-based projection: at current done-rate, when do open tasks clear?
  const openNow = (last.total || 0) - (last.done || 0)
  const weeksLeft = velWeek > 0 ? openNow / velWeek : null

  const completionChart = LineChart({
    snaps, height: 150, yMax: 100,
    series: [{ color: PAL.green, value: donePctOf }],
    yFmt: v => Math.round(v) + '%',
  })
  const hoursChart = LineChart({
    snaps, height: 130,
    series: [
      { color: PAL.accent, dash: true, value: s => H(s.totalEst) },
      { color: PAL.green, value: s => H(s.totalSpent) },
    ],
    yFmt: v => Math.round(v),
  })

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }
  const title = { fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--text)' }
  const legend = (c, t, dash) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-family:'DM Sans',sans-serif;font-size:11px;color:#5A6480"><span style="width:14px;height:0;border-top:${dash ? '2px dashed' : '3px solid'} ${c};display:inline-block"></span>${t}</span>`

  const kpis = [
    { label: 'Završeno', value: `${Math.round(donePctOf(last))}%`, delta: `${donePctDelta >= 0 ? '+' : ''}${donePctDelta}%`, good: donePctDelta >= 0 },
    { label: 'Brzina', value: `${velWeek.toFixed(1)}`, unit: '/ned', delta: `${doneDelta >= 0 ? '+' : ''}${doneDelta} u periodu`, good: doneDelta >= 0 },
    { label: 'Burn', value: `${burnPerDay.toFixed(1)}`, unit: 'h/dan', delta: `+${burnedH.toFixed(0)}h u periodu`, good: true, neutral: true },
    { label: 'Obim', value: `${scopeDelta >= 0 ? '+' : ''}${scopeDelta}`, unit: 'tsk', delta: scopeDelta > 0 ? 'scope creep' : (scopeDelta < 0 ? 'smanjen' : 'stabilan'), good: scopeDelta <= 0 },
  ]

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={title}>Trend ({spanDays} {spanDays === 1 ? 'dan' : 'dana'} · {snaps.length} tačaka)</div>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--textMuted)' }}>{fmtDay(first.day)} → {fmtDay(last.day)}</div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>
                {k.value}{k.unit && <span style={{ fontSize: 11, color: 'var(--textMuted)', fontWeight: 400 }}> {k.unit}</span>}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: k.neutral ? 'var(--textMuted)' : (k.good ? 'var(--green)' : 'var(--red)') }}>{k.delta}</div>
            </div>
          ))}
        </div>

        {weeksLeft != null && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)', marginBottom: 12 }}>
            🏁 Po trenutnoj brzini ({velWeek.toFixed(1)} taskova/ned), preostalih <strong style={{ color: 'var(--text)' }}>{openNow}</strong> otvorenih ≈ <strong style={{ color: 'var(--text)' }}>{weeksLeft.toFixed(1)} nedelja</strong>.
          </div>
        )}

        {/* Completion */}
        <div style={{ ...title, fontSize: 12, marginBottom: 4 }}>% završeno kroz vreme</div>
        <div dangerouslySetInnerHTML={{ __html: completionChart }} />

        {/* Hours */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ ...title, fontSize: 12, marginBottom: 4 }}>Utrošeno vs Estimacija (h)</div>
          <div dangerouslySetInnerHTML={{ __html: `<div style="margin-bottom:4px">${legend(PAL.accent, 'Estimacija', true)}${legend(PAL.green, 'Utrošeno')}</div>` + hoursChart }} />
        </div>
      </div>
    </div>
  )
}
