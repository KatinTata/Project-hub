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
const STACK_SHORT = { Backend: 'BE', Frontend: 'FE', Testing: 'QA', Ostalo: 'Ost' }

export default function ProjectEstimateSummary({ tasks, phases, projectId, createdAt }) {
  const [settings, setSettings] = useState(null)
  const [stackPeople, setStackPeople] = useState({})

  useEffect(() => {
    api.getAppSettings().then(setSettings).catch(() => setSettings({ workdayHours: 6.5, workdaysPerWeek: 5 }))
  }, [])

  useEffect(() => {
    if (typeof projectId !== 'number') return
    api.getStackPeople(projectId).then(m => setStackPeople(m || {})).catch(() => {})
  }, [projectId])

  const teamMap = useMemo(() => {
    const o = {}
    for (const s of STACKS) o[s] = stackPeople[s] > 0 ? stackPeople[s] : 1
    return o
  }, [stackPeople])

  const data = useMemo(() => {
    if (!settings) return null
    const matrix = buildStackMatrix(tasks || [], phases || [])
    const wdh = settings.workdayHours > 0 ? settings.workdayHours : 6.5
    const hasPhases = (phases || []).length > 0

    let planSec = matrix.grand.plan
    let remSec = 0
    for (const r of matrix.rows) for (const s of matrix.stacks) remSec += Math.max(0, r.cells[s].plan - r.cells[s].spent)
    const planManDays = (planSec / 3600) / wdh
    const remManDays = (remSec / 3600) / wdh

    const noneRow = matrix.rows.find(r => r.phaseId === 'none')
    const unassignedManDays = noneRow ? (noneRow.total.plan / 3600) / wdh : 0

    const fcMatrix = hasPhases
      ? matrix
      : { stacks: matrix.stacks, rows: [{ phaseId: 'all', phaseName: 'Ceo projekat', cells: matrix.colTotals, total: matrix.grand }] }

    // Full plan: anchored at project creation date. Remaining ETA: from today.
    const planF = buildPhaseForecast(fcMatrix, settings, { basis: 'plan', peoplePerStackMap: teamMap, today: createdAt || undefined })
    const remF = buildPhaseForecast(fcMatrix, settings, { basis: 'remaining', peoplePerStackMap: teamMap })

    return { hasPhases, planManDays, remManDays, unassignedManDays, planEnd: planF.projectEnd, planDays: planF.totalWorkingDays, etaEnd: remF.projectEnd, etaDays: remF.totalWorkingDays }
  }, [tasks, phases, settings, teamMap, createdAt])

  if (!data) return null

  const box = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
  const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
  const big = { fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text)' }
  const sub = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }
  const teamStr = STACKS.map(s => `${STACK_SHORT[s]} ${teamMap[s]}`).join(' · ')

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
          <div style={sub}>ceo projekat (plan)</div>
        </div>
        <div>
          <div style={label}>Preostalo</div>
          <div style={{ ...big, color: 'var(--accent)' }}>{fmtDays(data.remManDays)} <span style={{ fontSize: 13, color: 'var(--textMuted)' }}>čd</span></div>
          <div style={sub}>na osnovu nelogovanog</div>
        </div>
        <div>
          <div style={label}>Pun plan — kraj</div>
          <div style={big}>{fmtDate(data.planEnd)}</div>
          <div style={sub}>{data.planDays} radnih dana od kreiranja{createdAt ? ` (${fmtDateAny(createdAt)})` : ''}</div>
        </div>
        <div>
          <div style={label}>Procena (preostalo)</div>
          <div style={{ ...big, color: 'var(--green)' }}>{fmtDate(data.etaEnd)}</div>
          <div style={sub}>{data.etaDays} radnih dana od danas</div>
        </div>
      </div>

      {data.unassignedManDays > 0.05 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
          ⚠️ <strong style={{ color: 'var(--text)' }}>{fmtDays(data.unassignedManDays)} čd</strong> neraspoређeno (nije ni u jednoj fazi) — nije uračunato u datum. Dodeli te taskove fazama za tačnu projekciju.
        </div>
      )}
    </div>
  )
}
