import { useState, useEffect } from 'react'
import { api } from '../api.js'

const PAL = { accent: '#2563EB', green: '#16A34A', muted: '#5A6480', border: '#E2E6F0', text: '#0F1523' }

function niceCeil(v) {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const f = v / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * base
}
const fmtDay = iso => { const [, m, d] = (iso || '').split('-'); return d && m ? `${d}.${m}.` : iso }

function LineChart({ snaps, series, width = 760, height = 240, yMax, yFmt }) {
  const padL = 44, padR = 14, padT = 14, padB = 38
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const n = snaps.length
  const max = yMax != null ? yMax : niceCeil(Math.max(1, ...series.flatMap(s => snaps.map(s.value))))
  const x = i => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1))
  const y = v => padT + plotH - (Math.min(v, max) / max) * plotH

  const ticks = 4
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
      xlabels += `<text x="${x(i).toFixed(1)}" y="${height - 12}" text-anchor="middle" font-family="DM Mono, monospace" font-size="10" fill="${PAL.muted}">${fmtDay(s.day)}</text>`
    }
  })

  let paths = ''
  for (const s of series) {
    const pts = snaps.map((snap, i) => `${x(i).toFixed(1)},${y(s.value(snap)).toFixed(1)}`).join(' ')
    paths += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="5 4"` : ''}/>`
    paths += snaps.map((snap, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s.value(snap)).toFixed(1)}" r="2.5" fill="${s.color}"/>`).join('')
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">${grid}${paths}${xlabels}</svg>`
}

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

  const H = sec => (sec || 0) / 3600
  const hoursChart = LineChart({
    snaps,
    series: [
      { color: PAL.accent, dash: true, value: s => H(s.totalEst) },
      { color: PAL.green, value: s => H(s.totalSpent) },
    ],
    yFmt: v => Math.round(v),
  })
  const doneChart = LineChart({
    snaps, height: 150, yMax: 1,
    series: [{ color: PAL.green, value: s => (s.total > 0 ? s.done / s.total : 0) }],
    yFmt: v => Math.round(v * 100) + '%',
  })

  const first = snaps[0], last = snaps[snaps.length - 1]
  const donePctDelta = ((last.total > 0 ? last.done / last.total : 0) - (first.total > 0 ? first.done / first.total : 0)) * 100

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }
  const title = { fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--text)' }
  const legend = (c, t) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-family:'DM Sans',sans-serif;font-size:12px;color:#5A6480"><span style="width:12px;height:3px;background:${c};display:inline-block;border-radius:2px"></span>${t}</span>`

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={title}>Utrošeno vs Estimacija kroz vreme</div>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--textMuted)' }}>{fmtDay(first.day)} → {fmtDay(last.day)} · {snaps.length} tačaka</div>
        </div>
        <div dangerouslySetInnerHTML={{ __html: `<div style="margin-bottom:8px">${legend(PAL.accent, 'Estimacija (h)')}${legend(PAL.green, 'Utrošeno (h)')}</div>` + hoursChart }} />
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={title}>% završeno kroz vreme</div>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 12, color: donePctDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {donePctDelta >= 0 ? '+' : ''}{Math.round(donePctDelta)}% u periodu
          </div>
        </div>
        <div dangerouslySetInnerHTML={{ __html: doneChart }} />
      </div>
    </div>
  )
}
