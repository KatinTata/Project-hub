import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import Topbar from '../components/Topbar.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtTok = n => {
  const v = Number(n) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
  return String(Math.round(v))
}
const fmtUsd = n => {
  if (n == null) return '—'
  const v = Number(n) || 0
  return '$' + (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4))
}
const fmtNum = n => (Number(n) || 0).toLocaleString('sr-RS')
const iso = d => d.toISOString().slice(0, 10)
const fmtMoney = (v, cur = 'USD') => {
  if (v == null) return '—'
  const n = Number(v) || 0
  const s = n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(4)
  return cur === 'USD' ? '$' + s : cur === 'EUR' ? s + ' €' : s + ' RSD'
}

function presetRange(key) {
  const now = new Date()
  const today = iso(now)
  if (key === '30d') { const f = new Date(now.getTime() - 30 * 86400000); return { from: iso(f), to: today } }
  if (key === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  if (key === 'prevMonth') {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const t = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: iso(f), to: iso(t) }
  }
  if (key === 'quarter') { const q = Math.floor(now.getMonth() / 3) * 3; return { from: iso(new Date(now.getFullYear(), q, 1)), to: today } }
  if (key === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today }
  return { from: iso(new Date(now.getTime() - 30 * 86400000)), to: today }
}

// Pure-SVG dual line chart (cost + requests per day)
function TrendChart({ days }) {
  if (!days?.length) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Nema podataka za period</div>
  const W = 860, H = 210, padL = 52, padR = 52, padT = 14, padB = 30
  const plotW = W - padL - padR, plotH = H - padT - padB
  const maxCost = Math.max(0.0001, ...days.map(d => d.cost_usd))
  const maxReq = Math.max(1, ...days.map(d => d.requests))
  const x = i => padL + (days.length === 1 ? plotW / 2 : plotW * i / (days.length - 1))
  const yc = v => padT + plotH - (v / maxCost) * plotH
  const yr = v => padT + plotH - (v / maxReq) * plotH
  const costPts = days.map((d, i) => `${x(i).toFixed(1)},${yc(d.cost_usd).toFixed(1)}`).join(' ')
  const reqPts = days.map((d, i) => `${x(i).toFixed(1)},${yr(d.requests).toFixed(1)}`).join(' ')
  const step = Math.max(1, Math.ceil(days.length / 8))
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--accent)', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />Trošak (USD)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--green)', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />Zahtevi</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 0.5, 1].map(t2 => (
          <g key={t2}>
            <line x1={padL} y1={padT + plotH * t2} x2={W - padR} y2={padT + plotH * t2} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 6} y={padT + plotH * t2 + 4} textAnchor="end" fontFamily="DM Mono" fontSize="10" fill="var(--textMuted)">{fmtUsd(maxCost * (1 - t2))}</text>
            <text x={W - padR + 6} y={padT + plotH * t2 + 4} textAnchor="start" fontFamily="DM Mono" fontSize="10" fill="var(--textMuted)">{fmtTok(maxReq * (1 - t2))}</text>
          </g>
        ))}
        <polyline points={costPts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={reqPts} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {days.map((d, i) => (i % step === 0 || i === days.length - 1) && (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontFamily="DM Mono" fontSize="10" fill="var(--textMuted)">{d.date.slice(5)}</text>
        ))}
      </svg>
    </div>
  )
}

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }
const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const big = { fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: 'var(--text)' }
const thStyle = { padding: '8px 12px', fontFamily: 'Syne', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--textMuted)', textAlign: 'left' }
const tdStyle = { padding: '8px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text)', borderTop: '1px solid var(--border)' }
const tdMono = { ...tdStyle, fontFamily: "'DM Mono'", fontSize: 12 }
const inputS = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, boxSizing: 'border-box' }
const btnS = { padding: '7px 16px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, border: '1px solid var(--borderHover)', background: 'var(--surfaceAlt)', color: 'var(--text)', cursor: 'pointer' }
const btnPrimary = { ...btnS, background: 'var(--accent)', color: '#fff', border: 'none' }

export default function AiUsagePage(props) {
  const isAdminUser = props.user?.role === 'admin' || props.user?.role === 'super_admin'
  if (!isAdminUser) return <ClientAiView {...props} />
  return <AdminAiView {...props} />
}

function AdminAiView({ user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }) {
  const isSuperAdmin = user?.role === 'super_admin'
  const [tab, setTab] = useState('overview')
  const [preset, setPreset] = useState('30d')
  const [range, setRange] = useState(presetRange('30d'))
  const [loading, setLoading] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [dash, setDash] = useState(null)
  const [trend, setTrend] = useState(null)
  const [byClient, setByClient] = useState(null)
  const [bySource, setBySource] = useState(null)
  const [byApp, setByApp] = useState(null)
  const [byModel, setByModel] = useState(null)
  const [expanded, setExpanded] = useState({})

  const q = `from=${range.from}&to=${range.to}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, t] = await Promise.all([api.aiUsageDashboard(q), api.aiUsageTrends(q)])
      setDash(d); setTrend(t)
      setNotConfigured(!!d.not_configured)
      const [c, s, a, m] = await Promise.all([
        api.aiUsageByClient(q), api.aiUsageBySource(q), api.aiUsageByApp(q), api.aiUsageByModel(q),
      ])
      setByClient(c); setBySource(s); setByApp(a); setByModel(m)
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }, [q])

  useEffect(() => { load() }, [load])

  function pickPreset(key) {
    setPreset(key)
    setRange(presetRange(key))
  }

  const navProps = { user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }

  const tabs = [
    ['overview', 'Pregled'], ['clients', 'Po klijentima'], ['sources', 'Po izvoru'],
    ['apps', 'Po aplikacijama'], ['models', 'Po modelu'], ['report', 'Izveštaj'],
    ...(isSuperAdmin ? [['settings', 'Podešavanja']] : []),
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}><BrainAnimation opacity={0.4} fullscreen /></div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Topbar {...navProps} currentPage="aiUsage" onOpenChat={onGoToMessages} />

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>AI Tokeni</h1>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>Potrošnja tokena i trošak po našoj ceni — uživo iz Agentic platforme</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[['30d', '30 dana'], ['month', 'Ovaj mesec'], ['prevMonth', 'Prošli mesec'], ['quarter', 'Kvartal'], ['year', 'Ova godina']].map(([k, l]) => (
                <button key={k} onClick={() => pickPreset(k)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                  border: preset === k ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: preset === k ? 'var(--accent)' : 'var(--surfaceAlt)', color: preset === k ? '#fff' : 'var(--text)',
                }}>{l}</button>
              ))}
              <input type="date" value={range.from} onChange={e => { setPreset(null); setRange(r => ({ ...r, from: e.target.value })) }} style={{ ...inputS, width: 140 }} />
              <input type="date" value={range.to} onChange={e => { setPreset(null); setRange(r => ({ ...r, to: e.target.value })) }} style={{ ...inputS, width: 140 }} />
            </div>
          </div>

          {notConfigured && (
            <div style={{ ...card, borderColor: 'var(--amber)', background: 'var(--amberTint)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>
              Agentic Admin API nije konfigurisan. {isSuperAdmin ? 'Unesi URL i master ključ u tabu Podešavanja.' : 'Zamoli super admina da unese pristupni ključ.'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: '6px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                background: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? '#fff' : 'var(--textMuted)',
                border: tab === k ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}>{l}</button>
            ))}
            {loading && <span style={{ alignSelf: 'center', fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', marginLeft: 6 }}>učitavam…</span>}
          </div>

          {tab === 'overview' && <Overview dash={dash} trend={trend} />}
          {tab === 'clients' && <PivotTable title="Potrošnja po klijentima" rows={byClient?.clients} childKey="sources" childName={r => r.source} nameKey="name" expanded={expanded} setExpanded={setExpanded} />}
          {tab === 'sources' && <PivotTable title="Potrošnja po izvoru" rows={bySource?.sources} childKey="clients" childName={r => r.name} nameKey="source" expanded={expanded} setExpanded={setExpanded} />}
          {tab === 'apps' && <AppsTable data={byApp} />}
          {tab === 'models' && <ModelsTable data={byModel} />}
          {tab === 'report' && <ReportTab range={range} />}
          {tab === 'settings' && isSuperAdmin && <SettingsTab />}
        </div>
      </div>
    </div>
  )
}

function Overview({ dash, trend }) {
  const t = dash?.totals
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div style={card}><div style={label}>Zahtevi</div><div style={big}>{t ? fmtNum(t.requests) : '—'}</div><div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }}>danas: {dash?.today ? fmtNum(dash.today.requests) : '—'}</div></div>
        <div style={card}><div style={label}>Trošak (naša cena)</div><div style={{ ...big, color: 'var(--accent)' }}>{t ? fmtUsd(t.total_cost_usd) : '—'}</div><div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }}>{t?.avg_cost_per_req != null ? fmtUsd(t.avg_cost_per_req) + ' / zahtev' : ''}</div></div>
        <div style={card}><div style={label}>Tokeni</div><div style={big}>{t ? fmtTok(t.total_tokens) : '—'}</div><div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }}>{t ? `in ${fmtTok(t.prompt_tokens)} · out ${fmtTok(t.completion_tokens)}` : ''}</div></div>
        <div style={card}><div style={label}>Aktivni klijenti</div><div style={big}>{dash ? dash.active_clients : '—'}</div><div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }}>{t ? `greške: ${fmtNum(t.error_count)}` : ''}</div></div>
      </div>
      {dash?.unpriced_models?.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
          Modeli bez cene (trošak im je 0): {dash.unpriced_models.join(', ')} — dodaj cene u Podešavanjima.
        </div>
      )}
      <div style={card}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 10 }}>Dnevni trend</div>
        <TrendChart days={trend?.days} />
      </div>
    </div>
  )
}

function PivotTable({ title, rows, childKey, childName, nameKey, expanded, setExpanded }) {
  if (!rows) return null
  const total = rows.reduce((s, r) => s + r.cost_usd, 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--textMuted)' }}>ukupno {fmtUsd(total)}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Naziv</th><th style={{ ...thStyle, textAlign: 'right' }}>Zahtevi</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Tokeni</th><th style={{ ...thStyle, textAlign: 'right' }}>Trošak</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>%</th>
        </tr></thead>
        <tbody>
          {rows.map(r => {
            const id = r[nameKey]
            const kids = r[childKey] || []
            const isOpen = !!expanded[id]
            return [
              <tr key={id} onClick={() => kids.length && setExpanded(p => ({ ...p, [id]: !p[id] }))} style={{ cursor: kids.length ? 'pointer' : 'default' }}>
                <td style={tdStyle}>{kids.length > 0 && <span style={{ marginRight: 6, opacity: 0.5, fontSize: 10 }}>{isOpen ? '▼' : '▶'}</span>}{r[nameKey]}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.tokens)}</td>
                <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtUsd(r.cost_usd)}</td>
                <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{total > 0 ? Math.round(r.cost_usd / total * 100) + '%' : '—'}</td>
              </tr>,
              ...(isOpen ? kids.map((k, i) => (
                <tr key={id + '-' + i} style={{ background: 'var(--surfaceAlt)' }}>
                  <td style={{ ...tdStyle, paddingLeft: 36, color: 'var(--textMuted)', fontSize: 12 }}>{childName(k)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtNum(k.requests)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtTok(k.tokens)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtUsd(k.cost_usd)}</td>
                  <td style={tdStyle} />
                </tr>
              )) : []),
            ]
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Nema podataka</div>}
    </div>
  )
}

function AppsTable({ data }) {
  if (!data) return null
  const rows = data.apps || []
  const total = rows.reduce((s, r) => s + r.cost_usd, 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Potrošnja po aplikacijama</span>
        {data.truncated && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--amber)' }}>prikazano prvih 40 akcija</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Aplikacija / akcija</th><th style={{ ...thStyle, textAlign: 'right' }}>Zahtevi</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Tokeni</th><th style={{ ...thStyle, textAlign: 'right' }}>Trošak</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>%</th>
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.app}>
            <td style={tdStyle}>{r.app}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtUsd(r.cost_usd)}</td>
            <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{total > 0 ? Math.round(r.cost_usd / total * 100) + '%' : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
      {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Nema podataka</div>}
    </div>
  )
}

function ModelsTable({ data }) {
  if (!data) return null
  const rows = data.models || []
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Potrošnja po modelu</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Model</th><th style={{ ...thStyle, textAlign: 'right' }}>Zahtevi</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Input</th><th style={{ ...thStyle, textAlign: 'right' }}>Output</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Trošak</th>
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.model}>
            <td style={tdStyle}>
              {r.model}
              {!r.priced && <span title="Model nema cenu — trošak je 0" style={{ marginLeft: 8, fontFamily: "'DM Mono'", fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--amberTint)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>bez cene</span>}
            </td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.prompt_tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.completion_tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtUsd(r.cost_usd)}</td>
          </tr>
        ))}</tbody>
      </table>
      {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Nema podataka</div>}
    </div>
  )
}

// ── Settings (super_admin): API key, markups, pricing table, sync ─────────────

function SettingsTab() {
  const [cfg, setCfg] = useState(null)
  const [models, setModels] = useState(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [globalMarkup, setGlobalMarkup] = useState('')
  const [testMsg, setTestMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [history, setHistory] = useState(null)
  const [edit, setEdit] = useState({}) // modelName → { model_markup_pct }

  const reload = useCallback(async () => {
    const [c, m] = await Promise.all([api.aiUsageAdminConfig(), api.aiUsageModels()])
    setCfg(c); setModels(m)
    setBaseUrl(c.base_url || '')
    setGlobalMarkup(String(c.pricing?.global_markup_pct ?? 20))
  }, [])
  useEffect(() => { reload() }, [reload])

  async function saveConfig() {
    setBusy(true)
    try {
      await api.aiUsageSaveConfig({ base_url: baseUrl, is_active: true, service_password: keyInput || undefined })
      setKeyInput('')
      await reload()
    } finally { setBusy(false) }
  }
  async function test() {
    setBusy(true); setTestMsg(null)
    try { setTestMsg(await api.aiUsageTest(keyInput ? { base_url: baseUrl, service_password: keyInput } : { base_url: baseUrl })) }
    catch (e) { setTestMsg({ ok: false, message: e.message }) }
    finally { setBusy(false) }
  }
  async function saveMarkup() {
    setBusy(true)
    try { await api.aiUsageSavePricingConfig({ global_markup_pct: Number(globalMarkup) }); await reload() }
    finally { setBusy(false) }
  }
  async function runSync() {
    setBusy(true)
    try { await api.aiUsageSync(); await reload() }
    catch (e) { alert('Sync greška: ' + e.message) }
    finally { setBusy(false) }
  }
  async function saveModel(name) {
    const e = edit[name]
    if (!e) return
    setBusy(true)
    try {
      await api.aiUsageSaveModel(name, e)
      setEdit(p => { const n = { ...p }; delete n[name]; return n })
      await reload()
    } finally { setBusy(false) }
  }
  async function toggleHistory() {
    if (!histOpen && !history) setHistory((await api.aiUsageHistory('limit=100')).history)
    setHistOpen(o => !o)
  }

  if (!cfg) return <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Učitavam…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 10 }}>Agentic Admin API</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://intelisale-agentic.azurewebsites.net" style={{ ...inputS, flex: '1 1 320px' }} />
          <input value={keyInput} onChange={e => setKeyInput(e.target.value)} type="password" placeholder={cfg.has_password ? 'Master ključ: ••••• (ostavi prazno da zadržiš)' : 'Master ključ (X-Admin-Key)'} style={{ ...inputS, flex: '1 1 260px' }} />
          <button onClick={test} disabled={busy} style={btnS}>Test konekcije</button>
          <button onClick={saveConfig} disabled={busy} style={btnPrimary}>Sačuvaj</button>
        </div>
        {(testMsg || cfg.last_test_message) && (
          <div style={{ marginTop: 8, fontFamily: "'DM Mono'", fontSize: 12, color: (testMsg ? testMsg.ok : cfg.last_test_ok) ? 'var(--green)' : 'var(--red)' }}>
            {testMsg ? testMsg.message : cfg.last_test_message}
          </div>
        )}
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginRight: 'auto' }}>Cenovnik modela</span>
          <label style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Globalna marža %
            <input value={globalMarkup} onChange={e => setGlobalMarkup(e.target.value)} type="number" step="0.5" style={{ ...inputS, width: 80 }} />
          </label>
          <button onClick={saveMarkup} disabled={busy} style={btnS}>Sačuvaj maržu</button>
          <button onClick={runSync} disabled={busy} style={btnPrimary}>{busy ? 'Radim…' : 'Sync Azure cena'}</button>
        </div>
        {cfg.pricing?.last_sync_message && (
          <div style={{ padding: '8px 16px', fontFamily: "'DM Mono'", fontSize: 11, color: cfg.pricing.last_sync_ok ? 'var(--green)' : 'var(--red)', borderBottom: '1px solid var(--border)' }}>
            Poslednji sync: {cfg.pricing.last_sync_message} ({cfg.pricing.last_synced_at || '—'})
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
            <th style={thStyle}>Model</th><th style={{ ...thStyle, textAlign: 'right' }}>Bazna in / 1M</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Bazna out / 1M</th><th style={{ ...thStyle, textAlign: 'right' }}>Marža modela %</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Finalna in</th><th style={{ ...thStyle, textAlign: 'right' }}>Finalna out</th>
            <th style={thStyle}>Izvor</th><th style={thStyle} />
          </tr></thead>
          <tbody>{(models?.models || []).map(m => {
            const e = edit[m.model_name]
            return (
              <tr key={m.model_name} style={{ opacity: m.is_active ? 1 : 0.45 }}>
                <td style={{ ...tdMono, fontWeight: 600 }}>{m.model_name}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{m.input_price_per_1m.toFixed(4)}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{m.output_price_per_1m.toFixed(4)}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>
                  <input type="number" step="0.5" value={e?.model_markup_pct ?? m.model_markup_pct}
                    onChange={ev => setEdit(p => ({ ...p, [m.model_name]: { ...p[m.model_name], model_markup_pct: Number(ev.target.value) } }))}
                    style={{ ...inputS, width: 70, textAlign: 'right', padding: '3px 6px' }} />
                </td>
                <td style={{ ...tdMono, textAlign: 'right', color: 'var(--accent)' }}>{m.final_input_per_1m.toFixed(4)}</td>
                <td style={{ ...tdMono, textAlign: 'right', color: 'var(--accent)' }}>{m.final_output_per_1m.toFixed(4)}</td>
                <td style={{ ...tdMono, color: m.source === 'manual' ? 'var(--amber)' : 'var(--textMuted)' }}>{m.source}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {e && <button onClick={() => saveModel(m.model_name)} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11 }}>Sačuvaj</button>}
                </td>
              </tr>
            )
          })}</tbody>
        </table>
        {(models?.models || []).length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
            Nema modela — pokreni „Sync Azure cena".
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={toggleHistory} style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
            <span style={{ display: 'inline-block', transform: histOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', marginRight: 8 }}>▸</span>
            Istorija promena cena
          </button>
          {histOpen && (
            <div style={{ padding: '0 16px 12px', maxHeight: 260, overflowY: 'auto' }}>
              {(history || []).map(h => (
                <div key={h.id} style={{ display: 'flex', gap: 10, padding: '4px 0', borderTop: '1px solid var(--border)', fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text)', minWidth: 110 }}>{h.model_name}</span>
                  <span>in {h.old_input_per_1m ?? '—'} → {h.new_input_per_1m}</span>
                  <span>out {h.old_output_per_1m ?? '—'} → {h.new_output_per_1m}</span>
                  <span>{h.source} · {h.changed_by}</span>
                  <span style={{ marginLeft: 'auto' }}>{String(h.changed_at).slice(0, 16)}</span>
                </div>
              ))}
              {(history || []).length === 0 && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)', padding: '6px 0' }}>Nema promena.</div>}
            </div>
          )}
        </div>
      </div>

      <MappingsCard />
    </div>
  )
}

// ── Tenant ↔ klijent mapiranje (Faza 3, super_admin) ─────────────────────────

function MappingsCard() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => setData(await api.aiUsageMappings()), [])
  useEffect(() => { reload() }, [reload])

  async function discover() {
    setBusy(true)
    try { await api.aiUsageDiscover(); await reload() }
    catch (e) { alert('Greška: ' + e.message) }
    finally { setBusy(false) }
  }
  async function toggleUser(tenant, userId) {
    const current = (tenant.users || []).map(u => u.id)
    const next = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]
    await api.aiUsageSaveMapping(tenant.tenant_id, next)
    await reload()
  }

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ marginRight: 'auto' }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Mapiranje tenant → klijent</span>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>
            Poveži Agentic tenanta sa klijent-nalogom u Project Hub-u — taj korisnik onda vidi svoju potrošnju u modulu AI Tokeni.
          </div>
        </div>
        <button onClick={discover} disabled={busy} style={btnPrimary}>{busy ? 'Radim…' : 'Preuzmi tenante'}</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Tenant</th><th style={thStyle}>Kod</th><th style={thStyle}>Aktivan</th><th style={thStyle}>Klijent nalog</th>
        </tr></thead>
        <tbody>{(data?.mappings || []).map(m => (
          <tr key={m.tenant_id} style={{ opacity: m.is_active ? 1 : 0.45 }}>
            <td style={tdStyle}>{m.tenant_name || m.tenant_id}</td>
            <td style={tdMono}>{m.tenant_code || '—'}</td>
            <td style={tdMono}>{m.is_active ? 'da' : 'ne'}</td>
            <td style={tdStyle}>
              <MultiUserPicker tenant={m} clients={data?.clients || []} onToggle={toggleUser} />
            </td>
          </tr>
        ))}</tbody>
      </table>
      {(data?.mappings || []).length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          Nema tenanata — klikni „Preuzmi tenante" (zahteva konfigurisan Admin API).
        </div>
      )}
    </div>
  )
}

// Multi-select of client accounts for one tenant: chips + checkbox dropdown.
function MultiUserPicker({ tenant, clients, onToggle }) {
  const [open, setOpen] = useState(false)
  const assigned = new Set((tenant.users || []).map(u => u.id))
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {(tenant.users || []).map(u => (
          <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)' }}>
            {u.name}
            <button onClick={() => onToggle(tenant, u.id)} title="Ukloni" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--textMuted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <button onClick={() => setOpen(o => !o)} style={{ background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
          {open ? 'Zatvori' : '+ Dodaj'}
        </button>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxHeight: 240, overflowY: 'auto', minWidth: 260 }}>
          {clients.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)' }}>
              <input type="checkbox" checked={assigned.has(c.id)} onChange={() => onToggle(tenant, c.id)} />
              <span>{c.name}</span>
              <span style={{ color: 'var(--textMuted)', marginLeft: 'auto', fontSize: 11 }}>{c.email}</span>
            </label>
          ))}
          {clients.length === 0 && <div style={{ padding: '8px 10px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>Nema klijent naloga</div>}
        </div>
      )}
    </div>
  )
}

// ── Izveštaj po kupcu (Faza 2) ────────────────────────────────────────────────

function ReportTab({ range }) {
  const [tenants, setTenants] = useState(null)
  const [tenantGuid, setTenantGuid] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.aiUsageTenants().then(d => setTenants(d.tenants || [])) }, [])

  async function load() {
    if (!tenantGuid) return
    setBusy(true)
    try { setReport(await api.aiUsageTenantReport(`tenantGuid=${encodeURIComponent(tenantGuid)}&from=${range.from}&to=${range.to}&currency=${currency}`)) }
    catch (e) { alert('Greška: ' + e.message) }
    finally { setBusy(false) }
  }

  function exportPdf() {
    if (!report) return
    const cur = report.currency
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const money = v => fmtMoney(v, cur)
    const rows = (arr, cols) => arr.map(r => `<tr>${cols.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #E2E6F0;${c.right ? 'text-align:right;font-family:monospace' : ''}">${esc(c.v(r))}</td>`).join('')}</tr>`).join('')
    const table = (title, head, body) => `
      <h2 style="font-size:15px;margin:26px 0 8px;color:#0F2746;border-bottom:2px solid #38BDF8;padding-bottom:6px">${title}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${head.map(h => `<th style="text-align:${h.right ? 'right' : 'left'};padding:6px 10px;background:#F0F2F8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#5A6480">${h.t}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>`
    const html = `<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8"><title>AI potrošnja — ${esc(report.customer?.name)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#0F1523;max-width:800px;margin:0 auto;padding:28px}@media print{.noprint{display:none}}</style></head><body>
      <div class="noprint" style="text-align:right;margin-bottom:12px"><button onclick="window.print()" style="background:#7C3AED;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-weight:600;cursor:pointer">Sačuvaj kao PDF</button></div>
      <div style="background:#0F2746;color:#fff;border-radius:16px;padding:24px 28px;margin-bottom:24px">
        <div style="font-size:11px;letter-spacing:0.15em;color:#7DD3FC;margin-bottom:8px">INTELISALE — IZVEŠTAJ O AI POTROŠNJI</div>
        <div style="font-size:24px;font-weight:800">${esc(report.customer?.name)}</div>
        <div style="font-size:12px;color:#9FB2C9;margin-top:8px">Period: ${String(report.period?.from).slice(0, 10)} — ${String(report.period?.to).slice(0, 10)} · Valuta: ${cur}${report.rate_available === false ? ' (kurs nedostupan — prikaz u USD)' : ''}</div>
        <div style="display:flex;gap:36px;margin-top:16px">
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">ZAHTEVI</div><div style="font-size:18px;font-weight:700">${fmtNum(report.totals?.requests)}</div></div>
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">TOKENI</div><div style="font-size:18px;font-weight:700">${fmtTok(report.totals?.tokens)}</div></div>
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">UKUPAN TROŠAK</div><div style="font-size:18px;font-weight:700">${money(report.totals?.cost)}</div></div>
        </div>
      </div>
      ${table('Po modelu', [{ t: 'Model' }, { t: 'Zahtevi', right: 1 }, { t: 'Tokeni', right: 1 }, { t: 'Trošak', right: 1 }],
        rows(report.models || [], [{ v: r => r.model }, { v: r => fmtNum(r.requests), right: 1 }, { v: r => fmtTok(r.tokens), right: 1 }, { v: r => money(r.cost), right: 1 }]))}
      ${table('Po izvoru', [{ t: 'Izvor' }, { t: 'Zahtevi', right: 1 }, { t: 'Tokeni', right: 1 }, { t: 'Trošak', right: 1 }],
        rows(report.bySource || [], [{ v: r => r.source }, { v: r => fmtNum(r.requests), right: 1 }, { v: r => fmtTok(r.tokens), right: 1 }, { v: r => money(r.cost), right: 1 }]))}
      ${table('Po aplikaciji', [{ t: 'Aplikacija' }, { t: 'Zahtevi', right: 1 }, { t: 'Tokeni', right: 1 }, { t: 'Trošak', right: 1 }],
        rows(report.byApp || [], [{ v: r => r.app }, { v: r => fmtNum(r.requests), right: 1 }, { v: r => fmtTok(r.tokens), right: 1 }, { v: r => money(r.cost), right: 1 }]))}
      <div style="margin-top:32px;padding-top:14px;border-top:1px solid #E2E6F0;font-size:10px;color:#A0AABF;text-align:center;letter-spacing:0.1em">INTELISALE · EMPOWERING SALES EXCELLENCE</div>
    </body></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={tenantGuid} onChange={e => setTenantGuid(e.target.value)} style={{ ...inputS, minWidth: 260 }}>
          <option value="">— izaberi kupca —</option>
          {(tenants || []).map(t2 => <option key={t2.tenant_guid} value={t2.tenant_guid}>{t2.name}{t2.code ? ` (${t2.code})` : ''}</option>)}
        </select>
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputS, width: 90 }}>
          {['USD', 'EUR', 'RSD'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} disabled={!tenantGuid || busy} style={btnPrimary}>{busy ? 'Učitavam…' : 'Učitaj izveštaj'}</button>
        {report && <button onClick={exportPdf} style={{ ...btnS, background: '#7C3AED', color: '#fff', border: 'none' }}>Export PDF</button>}
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>period: {range.from} — {range.to}</span>
      </div>

      {report && (
        <>
          {report.rate_available === false && (
            <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
              Kurs za izabranu valutu nije dostupan — iznosi su prikazani u USD. (Podešavanja → Dohvati kurseve)
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div style={card}><div style={label}>Kupac</div><div style={{ ...big, fontSize: 18 }}>{report.customer?.name}</div></div>
            <div style={card}><div style={label}>Zahtevi</div><div style={big}>{fmtNum(report.totals?.requests)}</div></div>
            <div style={card}><div style={label}>Tokeni</div><div style={big}>{fmtTok(report.totals?.tokens)}</div></div>
            <div style={card}><div style={label}>Trošak ({report.currency})</div><div style={{ ...big, color: 'var(--accent)' }}>{fmtMoney(report.totals?.cost, report.currency)}</div></div>
          </div>
          <ReportTable title="Po modelu" rows={report.models} nameKey="model" cur={report.currency} />
          <ReportTable title="Po izvoru" rows={report.bySource} nameKey="source" cur={report.currency} />
          <ReportTable title="Po aplikaciji" rows={report.byApp} nameKey="app" cur={report.currency} />
        </>
      )}
    </div>
  )
}

function ReportTable({ title, rows, nameKey, cur }) {
  if (!rows?.length) return null
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Naziv</th><th style={{ ...thStyle, textAlign: 'right' }}>Zahtevi</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Tokeni</th><th style={{ ...thStyle, textAlign: 'right' }}>Trošak</th>
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td style={tdStyle}>{r[nameKey]}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.cost, cur)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

// ── Klijentski pogled (Faza 3): samo sopstvena potrošnja ─────────────────────

function ClientAiView({ user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }) {
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(presetRange('month'))
  const [currency, setCurrency] = useState('EUR')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.aiUsageMy(`from=${range.from}&to=${range.to}&currency=${currency}`)) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [range.from, range.to, currency])
  useEffect(() => { load() }, [load])

  const navProps = { user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }
  const cur = data?.currency || currency
  const days = (data?.days || []).map(d => ({ date: d.date, requests: d.requests, cost_usd: d.cost }))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}><BrainAnimation opacity={0.4} fullscreen /></div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Topbar {...navProps} currentPage="aiUsage" onOpenChat={onGoToMessages} />
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>AI potrošnja</h1>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
                {data?.customer?.name ? `${data.customer.name} — potrošnja AI servisa po aplikacijama` : 'Potrošnja AI servisa vaše organizacije'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[['month', 'Ovaj mesec'], ['prevMonth', 'Prošli mesec'], ['quarter', 'Kvartal'], ['year', 'Ova godina']].map(([k, l]) => (
                <button key={k} onClick={() => { setPreset(k); setRange(presetRange(k)) }} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                  border: preset === k ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: preset === k ? 'var(--accent)' : 'var(--surfaceAlt)', color: preset === k ? '#fff' : 'var(--text)',
                }}>{l}</button>
              ))}
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputS, width: 84 }}>
                {['EUR', 'USD', 'RSD'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {loading && <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>učitavam…</span>}
            </div>
          </div>

          {data?.not_mapped && (
            <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
              Vaš nalog još nije povezan sa AI potrošnjom. Kontaktirajte Intelisale tim da aktivira prikaz.
            </div>
          )}

          {data && !data.not_mapped && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.rate_available === false && (
                <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                  Kurs za izabranu valutu trenutno nije dostupan — iznosi su u USD.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <div style={card}><div style={label}>Zahtevi</div><div style={big}>{fmtNum(data.totals?.requests)}</div></div>
                <div style={card}><div style={label}>Tokeni</div><div style={big}>{fmtTok(data.totals?.tokens)}</div></div>
                <div style={card}><div style={label}>Trošak ({cur})</div><div style={{ ...big, color: 'var(--accent)' }}>{fmtMoney(data.totals?.cost, cur)}</div></div>
              </div>
              <div style={card}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 10 }}>Dnevni trend</div>
                <TrendChart days={days} />
              </div>
              <ReportTable title="Po aplikaciji" rows={data.byApp} nameKey="app" cur={cur} />
              <ReportTable title="Po modelu" rows={data.models} nameKey="model" cur={cur} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
