import { useState, useEffect, useMemo } from 'react'
import { api } from '../api.js'
import { fmtHours } from '../utils.js'
import { buildStackMatrix, buildStackTeams } from '../utils/stacks.js'
import { buildPhaseForecast } from '../utils/forecast.js'

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}
const fmtDays = n => (Math.round(n * 10) / 10).toFixed(1)

const STACK_COLORS = {
  Backend: 'var(--accent)',
  Frontend: '#8B5CF6',
  Testing: 'var(--amber)',
  Ostalo: 'var(--textSubtle)',
}

export default function PhaseForecast({ tasks, phases, canEditConfig }) {
  const [settings, setSettings] = useState(null)
  const [basis, setBasis] = useState('remaining')
  const [hcOverride, setHcOverride] = useState({}) // { stack: number }
  const [showTeam, setShowTeam] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ workdayHours: 6.5, workdaysPerWeek: 5 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getAppSettings()
      .then(s => { setSettings(s); setDraft({ workdayHours: s.workdayHours, workdaysPerWeek: s.workdaysPerWeek }) })
      .catch(() => setSettings({ workdayHours: 6.5, workdaysPerWeek: 5 }))
  }, [])

  const matrix = useMemo(() => buildStackMatrix(tasks || [], phases || []), [tasks, phases])
  const teams = useMemo(() => buildStackTeams(tasks || [], phases || []), [tasks, phases])
  const stacks = matrix.stacks

  const effectiveHc = useMemo(() => {
    const o = {}
    for (const s of stacks) {
      const def = Math.max(1, teams.byStack[s]?.realCount || 0)
      const ov = hcOverride[s]
      o[s] = ov > 0 ? ov : def
    }
    return o
  }, [stacks, teams, hcOverride])

  const forecast = useMemo(
    () => (settings ? buildPhaseForecast(matrix, settings, { basis, peoplePerStackMap: effectiveHc }) : null),
    [matrix, settings, basis, effectiveHc]
  )

  async function saveConfig() {
    setSaving(true)
    try {
      const s = await api.updateAppSettings({ workdayHours: parseFloat(draft.workdayHours), workdaysPerWeek: parseInt(draft.workdaysPerWeek, 10) })
      setSettings(s)
      setEditing(false)
    } catch (e) {
      alert(e.message || 'Greška pri čuvanju konfiguracije')
    } finally {
      setSaving(false)
    }
  }

  if (!forecast) {
    return <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Učitavam procenu…</div>
  }

  const cols = `minmax(140px, 1.3fr) repeat(${stacks.length}, 1fr) 0.8fr 1.1fr 1.6fr`
  const head = { padding: '8px 10px', fontFamily: 'Syne', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--textMuted)' }
  const labelMuted = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
      {/* Header + basis */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Procena završetka po fazama</div>
          <div style={{ ...labelMuted, marginTop: 2 }}>Napor (čovek-dani) → trajanje (broj ljudi po steku, paralelno) → ulančani datumi</div>
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
          {[['remaining', 'Preostalo'], ['plan', 'Pun plan']].map(([v, l]) => (
            <button key={v} onClick={() => setBasis(v)} style={{
              padding: '5px 10px', fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer', border: 'none',
              background: basis === v ? 'var(--accent)' : 'transparent', color: basis === v ? '#fff' : 'var(--textMuted)',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Config bar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surfaceAlt)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {!editing ? (
          <>
            <span style={labelMuted}>Radni kalendar:</span>
            <span style={{ fontFamily: "'DM Mono'", fontSize: 13, color: 'var(--text)' }}>{settings.workdayHours} h/dan</span>
            <span style={{ color: 'var(--textSubtle)' }}>·</span>
            <span style={{ fontFamily: "'DM Mono'", fontSize: 13, color: 'var(--text)' }}>{settings.workdaysPerWeek} dana/nedelji</span>
            {canEditConfig && (
              <button onClick={() => setEditing(true)} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Izmeni</button>
            )}
          </>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...labelMuted }}>
              Sati/dan
              <input type="number" step={0.5} min={1} max={24} value={draft.workdayHours}
                onChange={e => setDraft(d => ({ ...d, workdayHours: e.target.value }))}
                style={{ width: 64, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Mono'", fontSize: 12 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...labelMuted }}>
              Dana/nedelji
              <input type="number" min={1} max={7} value={draft.workdaysPerWeek}
                onChange={e => setDraft(d => ({ ...d, workdaysPerWeek: e.target.value }))}
                style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Mono'", fontSize: 12 }} />
            </label>
            <button onClick={saveConfig} disabled={saving} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'Čuvam…' : 'Sačuvaj'}</button>
            <button onClick={() => { setEditing(false); setDraft({ workdayHours: settings.workdayHours, workdaysPerWeek: settings.workdaysPerWeek }) }} style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Otkaži</button>
          </>
        )}
      </div>

      {/* Per-stack headcount */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={labelMuted}>Ljudi po steku:</span>
        {stacks.map(s => {
          const def = Math.max(1, teams.byStack[s]?.realCount || 0)
          const overridden = hcOverride[s] > 0 && hcOverride[s] !== def
          return (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: STACK_COLORS[s] || 'var(--textSubtle)', display: 'inline-block' }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)' }}>{s}</span>
              <input type="number" min={1} max={50} value={effectiveHc[s]}
                onChange={e => setHcOverride(o => ({ ...o, [s]: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                title={`Izvedeno iz Jire: ${def}`}
                style={{ width: 46, padding: '3px 6px', borderRadius: 6, border: `1px solid ${overridden ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Mono'", fontSize: 12 }} />
            </label>
          )
        })}
        <button onClick={() => setShowTeam(v => !v)} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
          {showTeam ? 'Sakrij tim' : 'Tim po steku'}
        </button>
      </div>

      {/* Team panel */}
      {showTeam && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surfaceAlt)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {stacks.map(s => {
            const t = teams.byStack[s]
            const real = (t?.people || []).filter(n => n !== 'Neraspoređeno')
            return (
              <div key={s} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: STACK_COLORS[s] || 'var(--text)' }}>{s}</span>
                  <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>{real.length} {real.length === 1 ? 'osoba' : 'ljudi'} · {fmtHours(t?.spent || 0)}</span>
                </div>
                {real.length ? real.map(n => (
                  <div key={n} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)', padding: '2px 0' }}>{n}</div>
                )) : <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textSubtle)' }}>—</div>}
                {(t?.people || []).includes('Neraspoređeno') && (
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textSubtle)', marginTop: 2 }}>+ neraspoređeno</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {forecast.phases.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          Definiši faze (tab „Faze") da bi dobio procenu završetka.
        </div>
      ) : (
        <>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--surfaceAlt)', borderBottom: '1px solid var(--border)' }}>
            <div style={head}>Faza</div>
            {stacks.map(s => <div key={s} style={{ ...head, color: STACK_COLORS[s] || 'var(--textMuted)' }}>{s} (čd)</div>)}
            <div style={head}>Ukupno čd</div>
            <div style={head}>Trajanje</div>
            <div style={{ ...head, textAlign: 'right' }}>Start → Kraj</div>
          </div>

          {forecast.phases.map(p => (
            <div key={p.phaseId} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--border)', opacity: p.empty ? 0.5 : 1 }}>
              <div style={{ padding: '8px 10px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center' }}>{p.phaseName}</div>
              {stacks.map(s => (
                <div key={s} style={{ padding: '8px 10px', fontFamily: "'DM Mono'", fontSize: 12, color: p.stackManDays[s] > 0 ? 'var(--text)' : 'var(--textSubtle)' }}>
                  {p.stackManDays[s] > 0 ? fmtDays(p.stackManDays[s]) : '–'}
                </div>
              ))}
              <div style={{ padding: '8px 10px', fontFamily: "'DM Mono'", fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{fmtDays(p.totalManDays)}</div>
              <div style={{ padding: '8px 10px', fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--text)' }}>{p.durationWorkingDays} {p.durationWorkingDays === 1 ? 'dan' : 'dana'}</div>
              <div style={{ padding: '8px 10px', fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--text)', textAlign: 'right' }}>
                {p.empty ? '—' : <>{fmtDate(p.start)} <span style={{ color: 'var(--textSubtle)' }}>→</span> {fmtDate(p.end)}</>}
              </div>
            </div>
          ))}

          {/* Footer */}
          <div style={{ padding: '12px 16px', background: 'var(--surfaceAlt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={labelMuted}>
              Ukupno {fmtDays(forecast.grandManDays)} čovek-dana · {forecast.totalWorkingDays} radnih dana
              {basis === 'remaining' ? ' (preostalo, od danas)' : ' (pun plan, od danas)'}
            </span>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Projektovani kraj: <span style={{ color: 'var(--green)' }}>{fmtDate(forecast.projectEnd)}</span>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
