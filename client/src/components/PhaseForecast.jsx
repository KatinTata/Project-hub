import { useState, useEffect, useMemo } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'
import { buildStackMatrix } from '../utils/stacks.js'
import { buildPhaseForecast } from '../utils/forecast.js'
import { buildCapacity } from '../utils/capacity.js'
import { setCalcConfig } from '../utils/calcConfig.js'

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}
const fmtDays = n => (Math.round(n * 10) / 10).toFixed(1)

const STACK_COLORS = { Backend: 'var(--accent)', Frontend: '#8B5CF6', Mobile: '#10B981', Database: '#0EA5E9', Testing: 'var(--amber)', Ostalo: 'var(--textSubtle)' }
const CAP_STATUS = {
  ok: { bg: 'var(--greenTint)', fg: 'var(--green)' },
  tight: { bg: 'var(--amberTint)', fg: 'var(--amber)' },
  over: { bg: 'var(--redTint)', fg: 'var(--red)' },
  nostaff: { bg: 'var(--redTint)', fg: 'var(--red)' },
  nocapacity: { bg: 'var(--amberTint)', fg: 'var(--amber)' },
}
const capChip = st => ({ fontFamily: "'Hanken Grotesk'", fontSize: 11, padding: '2px 8px', borderRadius: 6, background: (CAP_STATUS[st] || {}).bg || 'var(--surfaceAlt)', color: (CAP_STATUS[st] || {}).fg || 'var(--textMuted)', border: '1px solid var(--border)' })
const capLabel = (c, t) => c.status === 'nostaff' ? t('pf.noStaff') : c.status === 'nocapacity' ? t('pf.noCapacity') : (c.load != null ? Math.round(c.load * 100) + '%' : '–')

export default function PhaseForecast({ tasks, phases, createdAt, peoplePerStackMap, canEditConfig }) {
  const t = useT()
  const [settings, setSettings] = useState(null)
  const [basis, setBasis] = useState('remaining')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ workdayHours: 6.5, workdaysPerWeek: 5, overrunThresholdPct: 15, capacityTightPct: 85, overrunTailPct: 10 })
  const [saving, setSaving] = useState(false)

  const draftFrom = s => ({
    workdayHours: s.workdayHours, workdaysPerWeek: s.workdaysPerWeek,
    overrunThresholdPct: s.overrunThresholdPct ?? 15, capacityTightPct: s.capacityTightPct ?? 85, overrunTailPct: s.overrunTailPct ?? 10,
  })

  useEffect(() => {
    api.getAppSettings()
      .then(s => { setSettings(s); setDraft(draftFrom(s)); setCalcConfig(s) })
      .catch(() => setSettings({ workdayHours: 6.5, workdaysPerWeek: 5 }))
  }, [])

  const matrix = useMemo(() => buildStackMatrix(tasks || [], phases || []), [tasks, phases])
  const stacks = matrix.stacks
  const teamMap = peoplePerStackMap || undefined

  const forecast = useMemo(
    () => (settings ? buildPhaseForecast(matrix, settings, { basis, peoplePerStackMap: teamMap, today: basis === 'plan' ? (createdAt || undefined) : undefined }) : null),
    [matrix, settings, basis, teamMap, createdAt]
  )
  const cap = useMemo(
    () => (settings ? buildCapacity(tasks || [], phases || [], settings, { basis, peoplePerStack: teamMap }) : null),
    [tasks, phases, settings, basis, teamMap]
  )

  async function saveConfig() {
    setSaving(true)
    try {
      const s = await api.updateAppSettings({
        workdayHours: parseFloat(draft.workdayHours),
        workdaysPerWeek: parseInt(draft.workdaysPerWeek, 10),
        overrunThresholdPct: parseFloat(draft.overrunThresholdPct),
        capacityTightPct: parseFloat(draft.capacityTightPct),
        overrunTailPct: parseFloat(draft.overrunTailPct),
      })
      setSettings(s)
      setCalcConfig(s) // obračun odmah koristi nove pragove (P2-E2)
      setEditing(false)
    } catch (e) {
      alert(e.message || 'Greška pri čuvanju konfiguracije')
    } finally {
      setSaving(false)
    }
  }

  if (!forecast) {
    return <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>Učitavam procenu…</div>
  }

  const cols = `minmax(140px, 1.3fr) repeat(${stacks.length}, 1fr) 0.8fr 1.1fr 1.6fr`
  const head = { padding: '8px 10px', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--textMuted)' }
  const labelMuted = { fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }
  const teamNote = peoplePerStackMap
    ? stacks.map(s => `${s[0]}${s === 'Ostalo' ? 'st' : ''}:${peoplePerStackMap[s] || 0}`).join(' ')
    : 'tim nije definisan → 1/stek'

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
      {/* Header + basis */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Procena završetka po fazama</div>
          <div style={{ ...labelMuted, marginTop: 2 }}>Broj ljudi po steku iz „Tim po steku" gore · {teamNote}</div>
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
          {[['remaining', 'Preostalo'], ['plan', 'Pun plan']].map(([v, l]) => (
            <button key={v} onClick={() => setBasis(v)} style={{
              padding: '5px 10px', fontSize: 12, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, cursor: 'pointer', border: 'none',
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
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 13, color: 'var(--text)' }}>{settings.workdayHours} h/dan</span>
            <span style={{ color: 'var(--textSubtle)' }}>·</span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 13, color: 'var(--text)' }}>{settings.workdaysPerWeek} dana/nedelji</span>
            <span style={{ color: 'var(--textSubtle)' }}>·</span>
            <span style={labelMuted}>Pragovi:</span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 13, color: 'var(--text)' }} title="Prag prekoračenja taska">over &gt;{settings.overrunThresholdPct ?? 15}%</span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 13, color: 'var(--text)' }} title="Load iznad ovoga je tight">tight &gt;{settings.capacityTightPct ?? 85}%</span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 13, color: 'var(--text)' }} title="Rep preostalog rada za probijene otvorene taskove">rep {settings.overrunTailPct ?? 10}%</span>
            {canEditConfig && (
              <button onClick={() => setEditing(true)} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600 }}>Izmeni</button>
            )}
          </>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...labelMuted }}>
              Sati/dan
              <input type="number" step={0.5} min={1} max={24} value={draft.workdayHours}
                onChange={e => setDraft(d => ({ ...d, workdayHours: e.target.value }))}
                style={{ width: 64, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 12 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...labelMuted }}>
              Dana/nedelji
              <input type="number" min={1} max={7} value={draft.workdaysPerWeek}
                onChange={e => setDraft(d => ({ ...d, workdaysPerWeek: e.target.value }))}
                style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 12 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...labelMuted }} title="Task je prekoračen kad utrošeno pređe estimaciju za više od ovog procenta">
              Over %
              <input type="number" min={0} max={100} value={draft.overrunThresholdPct}
                onChange={e => setDraft(d => ({ ...d, overrunThresholdPct: e.target.value }))}
                style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 12 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...labelMuted }} title="Load kapaciteta iznad ovog procenta se označava kao tight">
              Tight %
              <input type="number" min={0} max={100} value={draft.capacityTightPct}
                onChange={e => setDraft(d => ({ ...d, capacityTightPct: e.target.value }))}
                style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 12 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...labelMuted }} title="Preostali rad probijenog otvorenog taska = ovaj procenat estimacije">
              Rep %
              <input type="number" min={0} max={100} value={draft.overrunTailPct}
                onChange={e => setDraft(d => ({ ...d, overrunTailPct: e.target.value }))}
                style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 12 }} />
            </label>
            <button onClick={saveConfig} disabled={saving} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif" }}>{saving ? 'Čuvam…' : 'Sačuvaj'}</button>
            <button onClick={() => { setEditing(false); setDraft(draftFrom(settings)) }} style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif" }}>Otkaži</button>
          </>
        )}
      </div>

      {forecast.phases.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>
          Definiši faze (tab „Faze") da bi dobio procenu završetka.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--surfaceAlt)', borderBottom: '1px solid var(--border)' }}>
            <div style={head}>Faza</div>
            {stacks.map(s => <div key={s} style={{ ...head, color: STACK_COLORS[s] || 'var(--textMuted)' }}>{s} (čd)</div>)}
            <div style={head}>Ukupno čd</div>
            <div style={head}>Trajanje</div>
            <div style={{ ...head, textAlign: 'right' }}>Start → Kraj</div>
          </div>

          {forecast.phases.map(p => (
            <div key={p.phaseId} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--border)', opacity: p.empty ? 0.5 : 1 }}>
              <div style={{ padding: '8px 10px', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center' }}>{p.phaseName}</div>
              {stacks.map(s => (
                <div key={s} style={{ padding: '8px 10px', fontFamily: "'Hanken Grotesk'", fontSize: 12, color: p.stackManDays[s] > 0 ? 'var(--text)' : 'var(--textSubtle)' }}>
                  {p.stackManDays[s] > 0 ? fmtDays(p.stackManDays[s]) : '–'}
                </div>
              ))}
              <div style={{ padding: '8px 10px', fontFamily: "'Hanken Grotesk'", fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{fmtDays(p.totalManDays)}</div>
              <div style={{ padding: '8px 10px', fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--text)' }}>{p.durationWorkingDays} {p.durationWorkingDays === 1 ? 'dan' : 'dana'}</div>
              <div style={{ padding: '8px 10px', fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--text)', textAlign: 'right' }}>
                {p.empty ? '—' : <>{fmtDate(p.start)} <span style={{ color: 'var(--textSubtle)' }}>→</span> {fmtDate(p.end)}</>}
              </div>
            </div>
          ))}

          <div style={{ padding: '12px 16px', background: 'var(--surfaceAlt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={labelMuted}>
              Ukupno {fmtDays(forecast.grandManDays)} čovek-dana · {forecast.totalWorkingDays} radnih dana
              {basis === 'remaining' ? ' (preostalo, od danas)' : ' (pun plan, od kreiranja)'}
            </span>
            <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Projektovani kraj: <span style={{ color: 'var(--green)' }}>{fmtDate(forecast.projectEnd)}</span>
            </span>
          </div>
        </>
      )}

      {/* Capacity vs effort in phase windows */}
      {cap && cap.anyWindow && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '12px 16px 4px', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
            Kapacitet vs napor (prozori faza)
            <span style={{ ...labelMuted, marginLeft: 8 }}>radni dani u prozoru × ljudi/stek × {settings.workdayHours}h · load %</span>
          </div>
          {cap.rows.filter(r => r.hasWindow).map(r => (
            <div key={r.phaseId} style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>{fmtDate(r.start)}–{fmtDate(r.due)} · {r.workingDays} r.d.</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {stacks.map(s => {
                  const c = r.cells[s]
                  if (c.status === 'none') return null
                  return <span key={s} style={capChip(c.status)}>{s}: {capLabel(c)}</span>
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {cap && !cap.anyWindow && forecast.phases.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', ...labelMuted }}>
          💡 Postavi <strong style={{ color: 'var(--text)' }}>start + rok</strong> na faze (tab „Faze") da bi dobio proveru kapaciteta i detekciju preopterećenja.
        </div>
      )}

      {cap && cap.warnings.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', background: 'var(--redTint)' }}>
          <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 12, color: 'var(--red)', marginBottom: 6 }}>⚠️ Preopterećenje ({cap.warnings.length})</div>
          {cap.warnings.slice(0, 8).map((w, i) => (
            <div key={i} style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--text)', padding: '2px 0' }}>
              <strong>{w.person}</strong> — „{w.phases.join('" + „')}" se preklapaju: {fmtDays(w.perDay)} h/dan ({fmtDays(w.over)}h preko {settings.workdayHours}h)
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
