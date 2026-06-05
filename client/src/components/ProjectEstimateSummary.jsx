import { useState, useEffect, useMemo } from 'react'
import { api } from '../api.js'
import { buildStackMatrix } from '../utils/stacks.js'
import { buildPhaseForecast } from '../utils/forecast.js'

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}
const fmtDays = n => (Math.round(n * 10) / 10).toFixed(1)

// Fixed assumption for the dashboard summary: 1 person per stack.
const ONE_PER_STACK = { Backend: 1, Frontend: 1, Testing: 1, Ostalo: 1 }

export default function ProjectEstimateSummary({ tasks, phases }) {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    api.getAppSettings().then(setSettings).catch(() => setSettings({ workdayHours: 6.5, workdaysPerWeek: 5 }))
  }, [])

  const data = useMemo(() => {
    if (!settings) return null
    const matrix = buildStackMatrix(tasks || [], phases || [])
    const wdh = settings.workdayHours > 0 ? settings.workdayHours : 6.5
    const hasPhases = (phases || []).length > 0

    // Effort (man-days) over ALL tasks (incl. unassigned)
    let planSec = matrix.grand.plan
    let remSec = 0
    for (const r of matrix.rows) for (const s of matrix.stacks) remSec += Math.max(0, r.cells[s].plan - r.cells[s].spent)
    const planManDays = (planSec / 3600) / wdh
    const remManDays = (remSec / 3600) / wdh

    // Unassigned (Neraspoređeno) shown separately, excluded from dates
    const noneRow = matrix.rows.find(r => r.phaseId === 'none')
    const unassignedManDays = noneRow ? (noneRow.total.plan / 3600) / wdh : 0

    // Dates: chained phases (phase-driven), 1 person/stack, from today.
    // If no phases yet, fall back to a single whole-project bucket so we still
    // give a number (clearly labeled).
    const fcMatrix = hasPhases
      ? matrix
      : { stacks: matrix.stacks, rows: [{ phaseId: 'all', phaseName: 'Ceo projekat', cells: matrix.colTotals, total: matrix.grand }] }

    const planF = buildPhaseForecast(fcMatrix, settings, { basis: 'plan', peoplePerStackMap: ONE_PER_STACK })
    const remF = buildPhaseForecast(fcMatrix, settings, { basis: 'remaining', peoplePerStackMap: ONE_PER_STACK })

    return { hasPhases, planManDays, remManDays, unassignedManDays, planEnd: planF.projectEnd, planDays: planF.totalWorkingDays, etaEnd: remF.projectEnd, etaDays: remF.totalWorkingDays }
  }, [tasks, phases, settings])

  if (!data) return null

  const box = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
  const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
  const big = { fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text)' }
  const sub = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }

  return (
    <div className="glass-card" style={box}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
          Procena resursa &amp; završetka <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11, color: 'var(--textMuted)' }}>· 1 osoba po steku, od danas</span>
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
          <div style={sub}>{data.planDays} radnih dana</div>
        </div>
        <div>
          <div style={label}>Procena (preostalo)</div>
          <div style={{ ...big, color: 'var(--green)' }}>{fmtDate(data.etaEnd)}</div>
          <div style={sub}>{data.etaDays} radnih dana od danas</div>
        </div>
      </div>

      {data.unassignedManDays > 0.05 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
          ⚠️ <strong style={{ color: 'var(--text)' }}>{fmtDays(data.unassignedManDays)} čd</strong> neraspoređeno (nije ni u jednoj fazi) — nije uračunato u datum. Dodeli te taskove fazama za tačnu projekciju.
        </div>
      )}
    </div>
  )
}
