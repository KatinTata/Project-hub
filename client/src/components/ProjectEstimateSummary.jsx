import { useState, useEffect, useMemo } from 'react'
import { api } from '../api.js'
import { buildStackMatrix, STACKS } from '../utils/stacks.js'
import { buildPhaseForecast } from '../utils/forecast.js'

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}
function fmtDateAny(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d)) return '—'
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}.`
}
const fmtDays = n => (Math.round(n * 10) / 10).toFixed(1)
const STACK_SHORT = { Backend: 'BE', Frontend: 'FE', Mobile: 'MOB', Database: 'DB', Testing: 'QA', Ostalo: 'Ost' }

// Working days between two ISO dates (exclusive of start, inclusive of end),
// Monday-based week with `wdpw` working days. Returns 0 if end <= start.
function workingDaysBetween(fromIso, toIso, wdpw) {
  if (!fromIso || !toIso) return 0
  const s = new Date(fromIso); s.setHours(0, 0, 0, 0)
  const e = new Date(toIso); e.setHours(0, 0, 0, 0)
  if (e <= s) return 0
  let n = 0, guard = 0
  const d = new Date(s)
  while (d < e && guard++ < 4000) {
    d.setDate(d.getDate() + 1)
    if (((d.getDay() + 6) % 7) < wdpw) n++
  }
  return n
}
const todayIso = () => {
  const d = new Date(); const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function ProjectEstimateSummary({ tasks, phases, createdAt, peoplePerStackMap }) {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    api.getAppSettings().then(setSettings).catch(() => setSettings({ workdayHours: 6.5, workdaysPerWeek: 5 }))
  }, [])

  const teamMap = useMemo(() => {
    const o = {}
    for (const s of STACKS) o[s] = (peoplePerStackMap && peoplePerStackMap[s] > 0) ? peoplePerStackMap[s] : 1
    return o
  }, [peoplePerStackMap])

  const data = useMemo(() => {
    if (!settings) return null
    const matrix = buildStackMatrix(tasks || [], phases || [])
    const wdh = settings.workdayHours > 0 ? settings.workdayHours : 6.5
    const wdpw = settings.workdaysPerWeek >= 1 && settings.workdaysPerWeek <= 7 ? settings.workdaysPerWeek : 5
    const hasPhases = (phases || []).length > 0

    const planSec = matrix.grand.plan
    const remSec = matrix.grand.remaining // status-aware (done→0, todo→plan, inprog→plan−spent)
    const planManDays = (planSec / 3600) / wdh
    const remManDays = (remSec / 3600) / wdh
    const donePct = planSec > 0 ? Math.round(((planSec - remSec) / planSec) * 100) : 0

    const noneRow = matrix.rows.find(r => r.phaseId === 'none')
    const unassignedManDays = noneRow ? (noneRow.total.remaining / 3600) / wdh : 0

    // Task-level risk signals (ETA can't predict these → surface them).
    const t = tasks || []
    const openTasks = t.filter(x => x.statusCategory !== 'done')
    const openOver = openTasks.filter(x => x.over)
    const openOverHours = openOver.reduce((a, x) => a + Math.max(0, (x.spent || 0) - (x.est || 0)), 0) / 3600
    const openNoEst = openTasks.filter(x => (x.est || 0) === 0).length

    const fcMatrix = hasPhases
      ? matrix
      : { stacks: matrix.stacks, rows: [{ phaseId: 'all', phaseName: 'Ceo projekat', cells: matrix.colTotals, total: matrix.grand }] }

    // Baseline: full plan anchored at creation date. ETA: remaining from today.
    const planF = buildPhaseForecast(fcMatrix, settings, { basis: 'plan', peoplePerStackMap: teamMap, today: createdAt || undefined })
    const remF = buildPhaseForecast(fcMatrix, settings, { basis: 'remaining', peoplePerStackMap: teamMap })

    // Is the baseline finish in the past relative to today? → delay.
    const today = todayIso()
    const baselineEnd = planF.projectEnd
    const lateDays = baselineEnd && baselineEnd < today ? workingDaysBetween(baselineEnd, today, wdpw) : 0

    return {
      hasPhases, planManDays, remManDays, donePct, unassignedManDays,
      openCount: openTasks.length, openOverCount: openOver.length, openOverHours, openNoEst,
      baselineEnd, baselineDays: planF.totalWorkingDays, lateDays,
      etaEnd: remF.projectEnd, etaDays: remF.totalWorkingDays,
    }
  }, [tasks, phases, settings, teamMap, createdAt])

  if (!data) return null

  const box = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
  const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
  const big = { fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text)' }
  const sub = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }
  const teamStr = STACKS.map(s => `${STACK_SHORT[s]} ${teamMap[s]}`).join(' · ')
  const onTrack = data.lateDays <= 0

  return (
    <div className="glass-card" style={box}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
          Procena resursa &amp; završetka <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: 'var(--textMuted)' }}>· tim: {teamStr}</span>
        </div>
        {!data.hasPhases && (
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--amber)', background: 'var(--amberTint)', border: '1px solid var(--amber)', borderRadius: 6, padding: '2px 8px' }}>
            nema faza — gruba procena; napravi faze za precizniji datum
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div>
          <div style={label}>Ukupno napora</div>
          <div style={big}>{fmtDays(data.planManDays)} <span style={{ fontSize: 13, color: 'var(--textMuted)' }}>čd</span></div>
          <div style={sub}>ceo projekat · <span style={{ color: 'var(--green)' }}>{data.donePct}% urađeno</span></div>
        </div>
        <div>
          <div style={label}>Preostalo</div>
          <div style={{ ...big, color: 'var(--accent)' }}>{fmtDays(data.remManDays)} <span style={{ fontSize: 13, color: 'var(--textMuted)' }}>čd</span></div>
          <div style={sub}>{data.openCount} {data.openCount === 1 ? 'otvoren task' : 'otvorenih taskova'} (po statusu)</div>
        </div>
        <div>
          <div style={label}>Procena završetka</div>
          <div style={{ ...big, color: 'var(--green)' }}>{fmtDate(data.etaEnd)}</div>
          <div style={sub}>{data.etaDays} {data.etaDays === 1 ? 'radni dan' : 'radnih dana'} od danas</div>
        </div>
        <div>
          <div style={label}>Plan (baseline)</div>
          <div style={{ ...big, fontSize: 18, color: 'var(--textMuted)' }}>{fmtDate(data.baselineEnd)}</div>
          <div style={sub}>
            {onTrack
              ? <span style={{ color: 'var(--green)' }}>● u roku vs baseline</span>
              : <span style={{ color: 'var(--red)' }}>● kasni {data.lateDays} {data.lateDays === 1 ? 'radni dan' : 'radnih dana'}</span>}
            {createdAt ? ` · start ${fmtDateAny(createdAt)}` : ''}
          </div>
        </div>
      </div>

      {(data.openOverCount > 0 || data.openNoEst > 0 || data.unassignedManDays > 0.05) && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
          {data.openOverCount > 0 && (
            <div><strong style={{ color: 'var(--red)' }}>{data.openOverCount}</strong> {data.openOverCount === 1 ? 'otvoren task već prekoračuje' : 'otvorenih taskova već prekoračuje'} estimaciju (+{fmtDays(data.openOverHours)}h preko plana) — procena ne uključuje dalja prekoračenja.</div>
          )}
          {data.openNoEst > 0 && (
            <div><strong style={{ color: 'var(--text)' }}>{data.openNoEst}</strong> {data.openNoEst === 1 ? 'otvoren task bez estimacije' : 'otvorenih taskova bez estimacije'} — ne ulaze u preostali napor ni datum.</div>
          )}
          {data.unassignedManDays > 0.05 && (
            <div><strong style={{ color: 'var(--text)' }}>{fmtDays(data.unassignedManDays)} čd</strong> preostalog posla nije ni u jednoj fazi — nije uračunato u datum. Dodeli te taskove fazama.</div>
          )}
        </div>
      )}
    </div>
  )
}
