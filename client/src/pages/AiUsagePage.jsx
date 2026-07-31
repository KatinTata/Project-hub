import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import Topbar from '../components/Topbar.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { PieChart, HBars, TrendChart, BudgetGauge, fmtTok, fmtNum, fmtMoney, colorAt } from '../components/aiCharts.jsx'

// ── shared styles / helpers ───────────────────────────────────────────────────

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }
const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const big = { fontFamily: 'Syne', fontWeight: 800, fontSize: 23, color: 'var(--text)' }
const sub = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }
const thStyle = { padding: '8px 12px', fontFamily: 'Syne', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--textMuted)', textAlign: 'left' }
const tdStyle = { padding: '8px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text)', borderTop: '1px solid var(--border)' }
const tdMono = { ...tdStyle, fontFamily: "'DM Mono'", fontSize: 12 }
const inputS = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, boxSizing: 'border-box' }
const btnS = { padding: '7px 16px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, border: '1px solid var(--borderHover)', background: 'var(--surfaceAlt)', color: 'var(--text)', cursor: 'pointer' }
const btnPrimary = { ...btnS, background: 'var(--accent)', color: '#fff', border: 'none' }
const iso = d => d.toISOString().slice(0, 10)

function presetRange(key) {
  const now = new Date()
  const today = iso(now)
  if (key === '7d') return { from: iso(new Date(now.getTime() - 7 * 86400000)), to: today }
  if (key === '30d') return { from: iso(new Date(now.getTime() - 30 * 86400000)), to: today }
  if (key === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  if (key === 'prevMonth') return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
  if (key === 'quarter') return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: today }
  if (key === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today }
  return { from: iso(new Date(now.getTime() - 30 * 86400000)), to: today }
}
const PRESETS = [['7d', '7 dana'], ['30d', '30 dana'], ['month', 'Ovaj mesec'], ['prevMonth', 'Prošli mesec'], ['quarter', 'Kvartal'], ['year', 'Ova godina']]

function AlertNotes({ alerts, onAck, compact }) {
  if (!alerts?.length) return null
  const worst = alerts.some(a => a.level === 'limit') ? 'limit' : 'warning'
  const c = worst === 'limit' ? { border: 'var(--red)', bg: 'var(--redTint)', fg: 'var(--red)' } : { border: 'var(--amber)', bg: 'var(--amberTint)', fg: 'var(--amber)' }
  return (
    <div style={{ ...card, borderColor: c.border, background: c.bg }}>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: c.fg, marginBottom: 8 }}>
        Obaveštenja o budžetu ({alerts.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)' }}>
            <span style={{
              fontFamily: "'DM Mono'", fontSize: 9, padding: '1px 7px', borderRadius: 4, flexShrink: 0,
              background: a.level === 'limit' ? 'var(--red)' : 'var(--amber)', color: '#fff',
            }}>{a.level === 'limit' ? 'LIMIT' : 'UPOZORENJE'}</span>
            <span style={{ flex: 1 }}>
              {!compact && <strong>{a.tenant_name}</strong>}{!compact && ' — '}
              {fmtMoney(a.spent_eur, 'EUR')} od {fmtMoney(a.limit_eur, 'EUR')} ({Math.round(a.pct)}%) · {a.month}
              {a.mail_sent ? '' : ' · mejl nije poslat'}
            </span>
            <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textMuted)' }}>{String(a.created_at).slice(0, 16)}</span>
            {onAck && <button onClick={() => onAck(a.id)} title="Označi kao pročitano" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.fg, fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ title, hint, right, children }) {
  return (
    <div style={{ ...card, padding: 0, overflow: 'visible' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        {hint && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>{hint}</span>}
        {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  )
}

function Kpi({ title, value, subtitle, color }) {
  return (
    <div style={card}>
      <div style={label}>{title}</div>
      <div style={{ ...big, ...(color ? { color } : {}) }}>{value}</div>
      {subtitle && <div style={sub}>{subtitle}</div>}
    </div>
  )
}

// Opens the server-rendered report (same charts as the Excel) in a new tab,
// where the built-in button triggers the browser's print-to-PDF.
async function openReportPdf(q, setBusy) {
  const w = window.open('', '_blank')
  if (w) w.document.write('<p style="font-family:sans-serif;padding:24px;color:#5A6480">Pravim izveštaj…</p>')
  setBusy?.(true)
  try {
    const html = await api.aiUsageReportHtml(q)
    if (w) { w.document.open(); w.document.write(html); w.document.close() }
  } catch (e) {
    w?.close()
    alert('PDF greška: ' + e.message)
  } finally { setBusy?.(false) }
}

function FilterBar({ preset, setPreset, range, setRange, onExport, onExportPdf, currency, setCurrency, exporting, loading }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {PRESETS.map(([k, l]) => (
        <button key={k} onClick={() => { setPreset(k); setRange(presetRange(k)) }} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          border: preset === k ? '1px solid var(--accent)' : '1px solid var(--border)',
          background: preset === k ? 'var(--accent)' : 'var(--surfaceAlt)', color: preset === k ? '#fff' : 'var(--text)',
        }}>{l}</button>
      ))}
      <input type="date" value={range.from} onChange={e => { setPreset(null); setRange(r => ({ ...r, from: e.target.value })) }} style={{ ...inputS, width: 138 }} />
      <input type="date" value={range.to} onChange={e => { setPreset(null); setRange(r => ({ ...r, to: e.target.value })) }} style={{ ...inputS, width: 138 }} />
      {setCurrency && (
        <select value={currency} onChange={e => setCurrency(e.target.value)} title="Valuta za Excel izveštaj" style={{ ...inputS, width: 82 }}>
          {['USD', 'EUR', 'RSD'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <button onClick={onExport} disabled={exporting} style={{ ...btnS, background: '#0D9488', color: '#fff', border: 'none' }}>
        {exporting ? 'Pravim…' : 'Excel izveštaj'}
      </button>
      {onExportPdf && (
        <button onClick={onExportPdf} disabled={exporting} style={{ ...btnS, background: '#7C3AED', color: '#fff', border: 'none' }}>
          PDF izveštaj
        </button>
      )}
      {loading && <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>učitavam…</span>}
    </div>
  )
}

export default function AiUsagePage(props) {
  const isAdminUser = props.user?.role === 'admin' || props.user?.role === 'super_admin'
  return isAdminUser ? <AdminAiView {...props} /> : <ClientAiView {...props} />
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────

function AdminAiView({ user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }) {
  const isSuperAdmin = user?.role === 'super_admin'
  const [view, setView] = useState('dashboard')
  const [preset, setPreset] = useState('30d')
  const [range, setRange] = useState(presetRange('30d'))
  const [currency, setCurrency] = useState('EUR')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [d, setD] = useState({})
  const [budgets, setBudgets] = useState(null)
  const [alertNotes, setAlertNotes] = useState([])
  const [expanded, setExpanded] = useState({})

  const q = `from=${range.from}&to=${range.to}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dash, trends] = await Promise.all([api.aiUsageDashboard(q), api.aiUsageTrends(q)])
      setNotConfigured(!!dash.not_configured)
      setD(prev => ({ ...prev, dash, trends }))
      const [byClient, bySource, byApp, byModel] = await Promise.all([
        api.aiUsageByClient(q), api.aiUsageBySource(q), api.aiUsageByApp(q), api.aiUsageByModel(q),
      ])
      setD(prev => ({ ...prev, byClient, bySource, byApp, byModel }))
      api.aiUsageBudgets().then(setBudgets).catch(() => {})
      api.aiUsageAlerts().then(r => setAlertNotes(r.alerts || [])).catch(() => {})
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [q])
  useEffect(() => { load() }, [load])

  async function exportXlsx() {
    setExporting(true)
    try { await api.aiUsageExportXlsx(`${q}&currency=${currency}`) }
    catch (e) { alert('Excel greška: ' + e.message) }
    finally { setExporting(false) }
  }
  const exportPdf = () => openReportPdf(`${q}&currency=${currency}`, setExporting)

  const navProps = { user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }
  const t = d.dash?.totals
  const clients = d.byClient?.clients || []
  const sources = d.bySource?.sources || []
  const apps = d.byApp?.apps || []
  const models = d.byModel?.models || []
  const alerts = (budgets?.budgets || []).filter(b => b.status && (b.status.level === 'warning' || b.status.level === 'limit'))
  const gauges = (budgets?.budgets || []).filter(b => b.status?.limit_eur > 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}><BrainAnimation opacity={0.4} fullscreen /></div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Topbar {...navProps} currentPage="aiUsage" onOpenChat={onGoToMessages} />
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '22px 22px 60px' }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>AI Tokeni</h1>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
                Potrošnja i trošak po našoj ceni — uživo iz Agentic platforme · trošak na ekranu je u USD
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['dashboard', 'Dashboard'], ['report', 'Izveštaj po kupcu'], ...(isSuperAdmin ? [['settings', 'Podešavanja']] : [])].map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                  background: view === k ? 'var(--accent)' : 'transparent', color: view === k ? '#fff' : 'var(--textMuted)',
                  border: view === k ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {notConfigured && (
            <div style={{ ...card, borderColor: 'var(--amber)', background: 'var(--amberTint)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>
              Agentic Admin API nije konfigurisan. {isSuperAdmin ? 'Unesi URL i master ključ u Podešavanjima.' : 'Zamoli super admina da unese pristupni ključ.'}
            </div>
          )}

          {view === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ ...card, padding: '12px 16px' }}>
                <FilterBar {...{ preset, setPreset, range, setRange, currency, setCurrency, exporting, loading }} onExport={exportXlsx} onExportPdf={exportPdf} />
              </div>

              <AlertNotes alerts={alertNotes} onAck={async id => { await api.aiUsageAckAlert(id); setAlertNotes(n => n.filter(x => x.id !== id)) }} />

              {alerts.length > 0 && (
                <div style={{ ...card, borderColor: alerts.some(a => a.status.level === 'limit') ? 'var(--red)' : 'var(--amber)', background: alerts.some(a => a.status.level === 'limit') ? 'var(--redTint)' : 'var(--amberTint)' }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: alerts.some(a => a.status.level === 'limit') ? 'var(--red)' : 'var(--amber)', marginBottom: 6 }}>
                    Budžet — {alerts.length} {alerts.length === 1 ? 'tenant zahteva pažnju' : 'tenanata zahteva pažnju'} ({budgets?.month})
                  </div>
                  {alerts.map(a => (
                    <div key={a.tenant_id} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)', padding: '2px 0' }}>
                      <strong>{a.tenant_name}</strong> — {fmtMoney(a.status.spent_eur, 'EUR')} od {fmtMoney(a.status.limit_eur, 'EUR')} ({Math.round(a.status.pct)}%)
                      {a.status.level === 'limit' ? ' — limit prekoračen' : ' — približava se limitu'}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <Kpi title="Zahtevi" value={t ? fmtNum(t.requests) : '—'} subtitle={d.dash?.today ? `danas: ${fmtNum(d.dash.today.requests)}` : ''} />
                <Kpi title="Trošak (naša cena)" value={t ? fmtMoney(t.total_cost_usd) : '—'} color="var(--accent)" subtitle={t?.avg_cost_per_req != null ? `${fmtMoney(t.avg_cost_per_req)} / zahtev` : ''} />
                <Kpi title="Tokeni" value={t ? fmtTok(t.total_tokens) : '—'} subtitle={t ? `in ${fmtTok(t.prompt_tokens)} · out ${fmtTok(t.completion_tokens)}` : ''} />
                <Kpi title="Aktivni klijenti" value={d.dash ? d.dash.active_clients : '—'} subtitle={`${clients.length} u periodu`} />
                <Kpi title="Greške" value={t ? fmtNum(t.error_count) : '—'} color={t?.error_count > 0 ? 'var(--red)' : 'var(--green)'} subtitle={t ? `uspešnih ${fmtNum(t.success_count)}` : ''} />
                <Kpi title="Prosečno trajanje" value={t ? `${Math.round(t.avg_duration_ms)} ms` : '—'} subtitle="po zahtevu" />
              </div>

              {d.dash?.unpriced_models?.length > 0 && (
                <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                  Modeli bez cene (trošak im se računa kao 0): {d.dash.unpriced_models.join(', ')} — dodaj cene u Podešavanjima → Cenovnik.
                </div>
              )}

              <Section title="Dnevni trend" hint="trošak (linija) i zahtevi (stubići)">
                <TrendChart days={(d.trends?.days || []).map(x => ({ date: x.date, requests: x.requests, cost: x.cost_usd }))} currency="USD" height={230} />
              </Section>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
                <Section title="Trošak po klijentu" hint="udeo u ukupnom trošku">
                  <PieChart data={clients.map(c => ({ label: c.name, value: c.cost_usd }))} valueFmt={v => fmtMoney(v)} centerValue={fmtMoney(t?.total_cost_usd)} centerLabel="ukupno" />
                </Section>
                <Section title="Trošak po izvoru" hint="SalesLeader vs eProcurement">
                  <PieChart data={sources.map((s, i) => ({ label: s.source, value: s.cost_usd, color: colorAt(i + 2) }))} valueFmt={v => fmtMoney(v)} centerValue={`${sources.length}`} centerLabel="izvora" />
                </Section>
                <Section title="Trošak po modelu">
                  <PieChart data={models.map(m => ({ label: m.model, value: m.cost_usd }))} valueFmt={v => fmtMoney(v)} centerValue={`${models.length}`} centerLabel="modela" />
                </Section>
                <Section title="Tokeni: input vs output">
                  <PieChart
                    data={[
                      { label: 'Prompt (input)', value: t?.prompt_tokens || 0, color: '#2563EB' },
                      { label: 'Completion (output)', value: t?.completion_tokens || 0, color: '#7C3AED' },
                    ]}
                    valueFmt={fmtTok} centerValue={fmtTok(t?.total_tokens)} centerLabel="tokena" />
                </Section>
                <Section title="Zahtevi po klijentu" hint="top 10">
                  <HBars data={clients.map(c => ({ label: c.name, value: c.requests }))} valueFmt={fmtNum} />
                </Section>
                <Section title="Trošak po aplikaciji" hint={d.byApp?.truncated ? 'prikazano prvih 40 akcija' : 'top 10'}>
                  <HBars data={apps.map(a => ({ label: a.app, value: a.cost_usd }))} valueFmt={v => fmtMoney(v)} color="#0D9488" />
                </Section>
              </div>

              {gauges.length > 0 && (
                <Section title="Budžeti — tekući mesec" hint={`${budgets?.month} · potrošeno vs mesečni limit`}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                    {gauges.map(b => (
                      <BudgetGauge key={b.tenant_id} name={b.tenant_name} spent={b.status.spent_eur} limit={b.status.limit_eur} pct={b.status.pct} level={b.status.level} />
                    ))}
                  </div>
                </Section>
              )}

              <PivotTable title="Detalji po klijentima" rows={clients} childKey="sources" childName={r => r.source} nameKey="name" idKey="key" expanded={expanded} setExpanded={setExpanded} />
              <PivotTable title="Detalji po izvoru" rows={sources} childKey="clients" childName={r => r.name} nameKey="source" idKey="source" expanded={expanded} setExpanded={setExpanded} />
              <SimpleTable title="Detalji po aplikacijama" rows={apps} nameKey="app" costKey="cost_usd" />
              <ModelsTable rows={models} />
            </div>
          )}

          {view === 'report' && <ReportView range={range} preset={preset} setPreset={setPreset} setRange={setRange} />}
          {view === 'settings' && isSuperAdmin && <SettingsView />}
        </div>
      </div>
    </div>
  )
}

// ── tables ────────────────────────────────────────────────────────────────────

function PivotTable({ title, rows, childKey, childName, nameKey, idKey, expanded, setExpanded }) {
  if (!rows?.length) return null
  const total = rows.reduce((s, r) => s + r.cost_usd, 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--textMuted)' }}>ukupno {fmtMoney(total)}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Naziv</th><th style={{ ...thStyle, textAlign: 'right' }}>Zahtevi</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Tokeni</th><th style={{ ...thStyle, textAlign: 'right' }}>Trošak</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Udeo</th>
        </tr></thead>
        <tbody>
          {rows.map(r => {
            const id = r[idKey]
            const kids = r[childKey] || []
            const isOpen = !!expanded[id]
            return [
              <tr key={id} onClick={() => kids.length && setExpanded(p => ({ ...p, [id]: !p[id] }))} style={{ cursor: kids.length ? 'pointer' : 'default' }}>
                <td style={tdStyle}>{kids.length > 0 && <span style={{ marginRight: 6, opacity: 0.5, fontSize: 10 }}>{isOpen ? '▼' : '▶'}</span>}{r[nameKey]}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.tokens)}</td>
                <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.cost_usd)}</td>
                <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{total > 0 ? Math.round(r.cost_usd / total * 100) + '%' : '—'}</td>
              </tr>,
              ...(isOpen ? kids.map((k, i) => (
                <tr key={id + '-' + i} style={{ background: 'var(--surfaceAlt)' }}>
                  <td style={{ ...tdStyle, paddingLeft: 38, color: 'var(--textMuted)', fontSize: 12 }}>{childName(k)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtNum(k.requests)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtTok(k.tokens)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtMoney(k.cost_usd)}</td>
                  <td style={tdStyle} />
                </tr>
              )) : []),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function SimpleTable({ title, rows, nameKey, costKey = 'cost', cur = 'USD' }) {
  if (!rows?.length) return null
  const total = rows.reduce((s, r) => s + (r[costKey] || 0), 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--textMuted)' }}>ukupno {fmtMoney(total, cur)}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Naziv</th><th style={{ ...thStyle, textAlign: 'right' }}>Zahtevi</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Tokeni</th><th style={{ ...thStyle, textAlign: 'right' }}>Trošak</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Udeo</th>
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td style={tdStyle}>{r[nameKey]}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r[costKey], cur)}</td>
            <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{total > 0 ? Math.round((r[costKey] || 0) / total * 100) + '%' : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function ModelsTable({ rows }) {
  if (!rows?.length) return null
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Detalji po modelu</div>
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
              {!r.priced && <span title="Model nema cenu — trošak se računa kao 0" style={{ marginLeft: 8, fontFamily: "'DM Mono'", fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--amberTint)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>bez cene</span>}
            </td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.prompt_tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.completion_tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.cost_usd)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

// ── Izveštaj po kupcu (PDF) ───────────────────────────────────────────────────

function ReportView({ range, preset, setPreset, setRange }) {
  const [tenants, setTenants] = useState(null)
  const [tenantGuid, setTenantGuid] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.aiUsageTenants().then(d => setTenants(d.tenants || [])).catch(() => setTenants([])) }, [])

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
    const rowsHtml = (arr, cols) => arr.map(r => `<tr>${cols.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #E2E6F0;${c.right ? 'text-align:right;font-family:monospace' : ''}">${esc(c.v(r))}</td>`).join('')}</tr>`).join('')
    const table = (title, head, body) => body ? `
      <h2 style="font-size:15px;margin:26px 0 8px;color:#0F2746;border-bottom:2px solid #38BDF8;padding-bottom:6px">${title}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${head.map(h => `<th style="text-align:${h.right ? 'right' : 'left'};padding:6px 10px;background:#F0F2F8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#5A6480">${h.t}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody></table>` : ''
    const cols = [{ v: r => r.name }, { v: r => fmtNum(r.requests), right: 1 }, { v: r => fmtTok(r.tokens), right: 1 }, { v: r => money(r.cost), right: 1 }]
    const head = [{ t: 'Naziv' }, { t: 'Zahtevi', right: 1 }, { t: 'Tokeni', right: 1 }, { t: 'Trošak', right: 1 }]
    const html = `<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8"><title>AI potrošnja — ${esc(report.customer?.name)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#0F1523;max-width:820px;margin:0 auto;padding:28px}@media print{.noprint{display:none}}</style></head><body>
      <div class="noprint" style="text-align:right;margin-bottom:12px"><button onclick="window.print()" style="background:#7C3AED;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-weight:600;cursor:pointer">Sačuvaj kao PDF</button></div>
      <div style="background:linear-gradient(135deg,#0b1a2f,#0f2746 55%,#163e6b);border-radius:16px;padding:24px 28px;color:#fff;margin-bottom:8px">
        <div style="font-size:11px;letter-spacing:0.16em;color:#38BDF8;margin-bottom:8px">INTELISALE — IZVEŠTAJ O AI POTROŠNJI</div>
        <div style="font-size:24px;font-weight:800">${esc(report.customer?.name)}</div>
        <div style="font-size:12px;color:#9FB2C9;margin-top:8px">Period: ${String(report.period?.from).slice(0, 10)} — ${String(report.period?.to).slice(0, 10)} · Valuta: ${cur}${report.rate_available === false ? ' (kurs nedostupan — prikaz u USD)' : ''}</div>
        <div style="display:flex;gap:36px;margin-top:16px">
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">ZAHTEVI</div><div style="font-size:18px;font-weight:700">${fmtNum(report.totals?.requests)}</div></div>
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">TOKENI</div><div style="font-size:18px;font-weight:700">${fmtTok(report.totals?.tokens)}</div></div>
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">UKUPAN TROŠAK</div><div style="font-size:18px;font-weight:700">${money(report.totals?.cost)}</div></div>
        </div>
      </div>
      ${table('Po modelu', head, rowsHtml((report.models || []).map(r => ({ ...r, name: r.model })), cols))}
      ${table('Po izvoru', head, rowsHtml((report.bySource || []).map(r => ({ ...r, name: r.source })), cols))}
      ${table('Po aplikaciji', head, rowsHtml((report.byApp || []).map(r => ({ ...r, name: r.app })), cols))}
      <div style="margin-top:32px;padding-top:14px;border-top:1px solid #E2E6F0;font-size:10px;color:#A0AABF;text-align:center;letter-spacing:0.1em">INTELISALE · EMPOWERING SALES EXCELLENCE</div>
    </body></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const cur = report?.currency || currency
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={tenantGuid} onChange={e => setTenantGuid(e.target.value)} style={{ ...inputS, minWidth: 250 }}>
          <option value="">— izaberi kupca —</option>
          {(tenants || []).map(x => <option key={x.tenant_guid} value={x.tenant_guid}>{x.name}{x.code ? ` (${x.code})` : ''}</option>)}
        </select>
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputS, width: 88 }}>
          {['USD', 'EUR', 'RSD'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {PRESETS.slice(1, 5).map(([k, l]) => (
          <button key={k} onClick={() => { setPreset(k); setRange(presetRange(k)) }} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            border: preset === k ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: preset === k ? 'var(--accent)' : 'var(--surfaceAlt)', color: preset === k ? '#fff' : 'var(--text)',
          }}>{l}</button>
        ))}
        <button onClick={load} disabled={!tenantGuid || busy} style={btnPrimary}>{busy ? 'Učitavam…' : 'Učitaj'}</button>
        {report && <button onClick={exportPdf} style={{ ...btnS, background: '#7C3AED', color: '#fff', border: 'none' }}>Export PDF</button>}
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>{range.from} — {range.to}</span>
      </div>

      {report && (
        <>
          {report.rate_available === false && (
            <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
              Kurs za izabranu valutu nije dostupan — iznosi su u USD (Podešavanja → Dohvati kurseve).
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi title="Kupac" value={<span style={{ fontSize: 17 }}>{report.customer?.name}</span>} />
            <Kpi title="Zahtevi" value={fmtNum(report.totals?.requests)} />
            <Kpi title="Tokeni" value={fmtTok(report.totals?.tokens)} />
            <Kpi title={`Trošak (${cur})`} value={fmtMoney(report.totals?.cost, cur)} color="var(--accent)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
            <Section title="Po modelu"><PieChart data={(report.models || []).map(m => ({ label: m.model, value: m.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={fmtMoney(report.totals?.cost, cur)} centerLabel="ukupno" /></Section>
            <Section title="Po aplikaciji"><PieChart data={(report.byApp || []).map(a => ({ label: a.app, value: a.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={`${(report.byApp || []).length}`} centerLabel="aplikacija" /></Section>
          </div>
          <SimpleTable title="Po modelu" rows={(report.models || []).map(m => ({ ...m, name: m.model }))} nameKey="name" cur={cur} />
          <SimpleTable title="Po izvoru" rows={(report.bySource || []).map(s => ({ ...s, name: s.source }))} nameKey="name" cur={cur} />
          <SimpleTable title="Po aplikaciji" rows={(report.byApp || []).map(a => ({ ...a, name: a.app }))} nameKey="name" cur={cur} />
        </>
      )}
    </div>
  )
}

// ── Podešavanja (super_admin): API, cenovnik, mapiranje, budžeti ──────────────

function SettingsView() {
  const [cfg, setCfg] = useState(null)
  const [models, setModels] = useState(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [globalMarkup, setGlobalMarkup] = useState('')
  const [testMsg, setTestMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [history, setHistory] = useState(null)
  const [edit, setEdit] = useState({})

  const reload = useCallback(async () => {
    const [c, m] = await Promise.all([api.aiUsageAdminConfig(), api.aiUsageModels()])
    setCfg(c); setModels(m)
    setBaseUrl(c.base_url || '')
    setGlobalMarkup(String(c.pricing?.global_markup_pct ?? 20))
  }, [])
  useEffect(() => { reload() }, [reload])

  const wrap = fn => async (...a) => { setBusy(true); try { await fn(...a); await reload() } catch (e) { alert('Greška: ' + e.message) } finally { setBusy(false) } }
  const saveConfig = wrap(async () => { await api.aiUsageSaveConfig({ base_url: baseUrl.trim(), is_active: true, service_password: keyInput || undefined }); setKeyInput('') })
  const saveMarkup = wrap(() => api.aiUsageSavePricingConfig({ global_markup_pct: Number(globalMarkup) }))
  const runSync = wrap(() => api.aiUsageSync())
  const fetchFx = wrap(() => api.aiUsageFxFetch())
  const saveModel = wrap(async name => { await api.aiUsageSaveModel(name, edit[name]); setEdit(p => { const n = { ...p }; delete n[name]; return n }) })

  async function test() {
    setBusy(true); setTestMsg(null)
    try { setTestMsg(await api.aiUsageTest({ base_url: baseUrl.trim(), ...(keyInput ? { service_password: keyInput } : {}) })) }
    catch (e) { setTestMsg({ ok: false, message: e.message }) }
    finally { setBusy(false) }
  }
  async function toggleHistory() {
    if (!histOpen && !history) setHistory((await api.aiUsageHistory('limit=100')).history)
    setHistOpen(o => !o)
  }

  if (!cfg) return <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Učitavam…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Agentic Admin API">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://intelisale-agentic.azurewebsites.net" style={{ ...inputS, flex: '1 1 320px' }} />
          <input value={keyInput} onChange={e => setKeyInput(e.target.value)} type="password" placeholder={cfg.has_password ? 'Master ključ: ••••• (prazno = zadrži)' : 'Master ključ (X-Admin-Key)'} style={{ ...inputS, flex: '1 1 250px' }} />
          <button onClick={test} disabled={busy} style={btnS}>Test konekcije</button>
          <button onClick={saveConfig} disabled={busy} style={btnPrimary}>Sačuvaj</button>
        </div>
        {(testMsg || cfg.last_test_message) && (
          <div style={{ marginTop: 8, fontFamily: "'DM Mono'", fontSize: 12, color: (testMsg ? testMsg.ok : cfg.last_test_ok) ? 'var(--green)' : 'var(--red)' }}>
            {testMsg ? testMsg.message : cfg.last_test_message}
          </div>
        )}
      </Section>

      <Section
        title="Cenovnik modela"
        hint={cfg.pricing?.last_sync_message ? `poslednji sync: ${cfg.pricing.last_sync_message}` : 'bazne Azure cene + marže'}
        right={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Globalna marža %
              <input value={globalMarkup} onChange={e => setGlobalMarkup(e.target.value)} type="number" step="0.5" style={{ ...inputS, width: 74 }} />
            </label>
            <button onClick={saveMarkup} disabled={busy} style={btnS}>Sačuvaj maržu</button>
            <button onClick={fetchFx} disabled={busy} style={btnS}>Dohvati kurseve</button>
            <button onClick={runSync} disabled={busy} style={btnPrimary}>{busy ? 'Radim…' : 'Sync Azure cena'}</button>
          </span>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
              <th style={thStyle}>Model</th><th style={{ ...thStyle, textAlign: 'right' }}>Bazna in</th><th style={{ ...thStyle, textAlign: 'right' }}>Bazna out</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Marža %</th><th style={{ ...thStyle, textAlign: 'right' }}>Finalna in</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Finalna out</th><th style={thStyle}>Izvor</th><th style={thStyle} />
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
                      style={{ ...inputS, width: 68, textAlign: 'right', padding: '3px 6px' }} />
                  </td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--accent)' }}>{m.final_input_per_1m.toFixed(4)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--accent)' }}>{m.final_output_per_1m.toFixed(4)}</td>
                  <td style={{ ...tdMono, color: m.source === 'manual' ? 'var(--amber)' : 'var(--textMuted)' }}>{m.source}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{e && <button onClick={() => saveModel(m.model_name)} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11 }}>Sačuvaj</button>}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        {(models?.models || []).length === 0 && <div style={{ padding: 18, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Nema modela — pokreni „Sync Azure cena".</div>}
        <button onClick={toggleHistory} style={{ marginTop: 10, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)', padding: 0 }}>
          <span style={{ display: 'inline-block', transform: histOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', marginRight: 8 }}>▸</span>Istorija promena cena
        </button>
        {histOpen && (
          <div style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
            {(history || []).map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 10, padding: '4px 0', borderTop: '1px solid var(--border)', fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text)', minWidth: 110 }}>{h.model_name}</span>
                <span>in {h.old_input_per_1m ?? '—'} → {h.new_input_per_1m}</span>
                <span>out {h.old_output_per_1m ?? '—'} → {h.new_output_per_1m}</span>
                <span>{h.source} · {h.changed_by}</span>
                <span style={{ marginLeft: 'auto' }}>{String(h.changed_at).slice(0, 16)}</span>
              </div>
            ))}
            {(history || []).length === 0 && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>Nema promena.</div>}
          </div>
        )}
      </Section>

      <MappingsCard />
      <BudgetsCard />
    </div>
  )
}

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
    const cur = (tenant.users || []).map(u => u.id)
    await api.aiUsageSaveMapping(tenant.tenant_id, cur.includes(userId) ? cur.filter(i => i !== userId) : [...cur, userId])
    await reload()
  }
  async function setTracked(tenantId, tracked) {
    await api.aiUsageSetTracked(tenantId, tracked)
    await reload()
  }

  return (
    <Section
      title="Mapiranje tenant → klijent"
      hint={'„aktivan" = prikazuje se u izveštajima i budžetima · jedan tenant može da vide više klijent-naloga'}
      right={<button onClick={discover} disabled={busy} style={btnPrimary}>{busy ? 'Radim…' : 'Preuzmi tenante'}</button>}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>Tenant</th><th style={thStyle}>Kod</th><th style={thStyle}>Pratimo</th><th style={thStyle}>Klijent nalozi</th>
        </tr></thead>
        <tbody>{(data?.mappings || []).map(m => (
          <tr key={m.tenant_id} style={{ opacity: m.is_tracked ? 1 : 0.45 }}>
            <td style={tdStyle}>{m.tenant_name || m.tenant_id}</td>
            <td style={tdMono}>{m.tenant_code || '—'}</td>
            <td style={tdStyle}>
              <button onClick={() => setTracked(m.tenant_id, !m.is_tracked)} title="Prikazuj ovog tenanta u izveštajima i budžetima"
                style={{
                  padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                  border: `1px solid ${m.is_tracked ? 'var(--green)' : 'var(--border)'}`,
                  background: m.is_tracked ? 'var(--greenTint)' : 'transparent',
                  color: m.is_tracked ? 'var(--green)' : 'var(--textMuted)',
                }}>{m.is_tracked ? 'aktivan' : 'neaktivan'}</button>
            </td>
            <td style={tdStyle}><MultiUserPicker tenant={m} clients={data?.clients || []} onToggle={toggleUser} /></td>
          </tr>
        ))}</tbody>
      </table>
      {(data?.mappings || []).length === 0 && <div style={{ padding: 18, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Nema tenanata — klikni „Preuzmi tenante".</div>}
    </Section>
  )
}

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
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxHeight: 240, overflowY: 'auto', minWidth: 270 }}>
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

function BudgetsCard() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState({})
  const reload = useCallback(async () => setData(await api.aiUsageBudgets()), [])
  useEffect(() => { reload() }, [reload])

  const save = async tenantId => {
    const e = edit[tenantId] || {}
    setBusy(true)
    try {
      await api.aiUsageSaveBudget(tenantId, e)
      setEdit(p => { const n = { ...p }; delete n[tenantId]; return n })
      await reload()
    } catch (err) { alert('Greška: ' + err.message) } finally { setBusy(false) }
  }
  const runCheck = async () => {
    setBusy(true)
    try {
      const r = await api.aiUsageCheckBudgets()
      alert(r.mail_configured
        ? `Provera završena. Poslato obaveštenja: ${r.results.filter(x => x.mail?.ok).length}`
        : 'SMTP nije podešen — obaveštenja se ne šalju (postavi SMTP_HOST/USER/PASS na serveru).')
      await reload()
    } catch (e) { alert('Greška: ' + e.message) } finally { setBusy(false) }
  }

  return (
    <Section
      title="Budžeti i obaveštenja"
      hint={data ? `mesec ${data.month} · ${data.mail_configured ? 'SMTP podešen' : 'SMTP NIJE podešen — mejlovi se ne šalju'}` : ''}
      right={<button onClick={runCheck} disabled={busy} style={btnS}>Proveri i pošalji sada</button>}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
            <th style={thStyle}>Tenant</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Mesečni limit (EUR)</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Warning %</th>
            <th style={thStyle}>Mejl</th>
            <th style={thStyle}>Dodatni primaoci</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Potrošeno</th>
            <th style={thStyle} />
          </tr></thead>
          <tbody>{(data?.budgets || []).map(b => {
            const e = edit[b.tenant_id] || {}
            const val = (k, def) => (e[k] !== undefined ? e[k] : def)
            const set = (k, v) => setEdit(p => ({ ...p, [b.tenant_id]: { ...p[b.tenant_id], [k]: v } }))
            const st = b.status
            const stColor = st?.level === 'limit' ? 'var(--red)' : st?.level === 'warning' ? 'var(--amber)' : 'var(--green)'
            return (
              <tr key={b.tenant_id}>
                <td style={tdStyle}>{b.tenant_name || b.tenant_id}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>
                  <input type="number" step="10" min="0" placeholder="—" value={val('monthly_limit_eur', b.monthly_limit_eur ?? '')}
                    onChange={ev => set('monthly_limit_eur', ev.target.value)} style={{ ...inputS, width: 96, textAlign: 'right', padding: '3px 6px' }} />
                </td>
                <td style={{ ...tdMono, textAlign: 'right' }}>
                  <input type="number" step="5" min="1" max="100" value={val('warning_pct', b.warning_pct)}
                    onChange={ev => set('warning_pct', ev.target.value)} style={{ ...inputS, width: 62, textAlign: 'right', padding: '3px 6px' }} />
                </td>
                <td style={tdStyle}>
                  <input type="checkbox" checked={!!val('notify_enabled', b.notify_enabled)} onChange={ev => set('notify_enabled', ev.target.checked)} />
                </td>
                <td style={tdStyle}>
                  <input placeholder="mejl1@x.com, mejl2@y.com" value={val('extra_emails', b.extra_emails || '')}
                    onChange={ev => set('extra_emails', ev.target.value)} style={{ ...inputS, width: 200, padding: '3px 8px', fontSize: 12 }} />
                </td>
                <td style={{ ...tdMono, textAlign: 'right', color: stColor }}>
                  {st ? `${fmtMoney(st.spent_eur, 'EUR')}${st.pct != null ? ` · ${Math.round(st.pct)}%` : ''}` : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {Object.keys(e).length > 0 && <button onClick={() => save(b.tenant_id)} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11 }}>Sačuvaj</button>}
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {(data?.budgets || []).length === 0 && <div style={{ padding: 18, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Nema tenanata — prvo „Preuzmi tenante" u sekciji iznad.</div>}
    </Section>
  )
}

// ── KLIJENT ───────────────────────────────────────────────────────────────────

function ClientAiView({ user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }) {
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(presetRange('month'))
  const [currency, setCurrency] = useState('EUR')
  const [data, setData] = useState(null)
  const [budget, setBudget] = useState(null)
  const [alertNotes, setAlertNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.aiUsageMy(`from=${range.from}&to=${range.to}&currency=${currency}`))
      api.aiUsageMyBudget().then(setBudget).catch(() => {})
      api.aiUsageAlerts().then(r => setAlertNotes(r.alerts || [])).catch(() => {})
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [range.from, range.to, currency])
  useEffect(() => { load() }, [load])

  async function exportXlsx() {
    setExporting(true)
    try { await api.aiUsageExportXlsx(`from=${range.from}&to=${range.to}&currency=${currency}`) }
    catch (e) { alert('Excel greška: ' + e.message) }
    finally { setExporting(false) }
  }
  const exportPdf = () => openReportPdf(`from=${range.from}&to=${range.to}&currency=${currency}`, setExporting)

  const navProps ={ user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }
  const cur = data?.currency || currency
  const apps = data?.byApp || []
  const models = data?.models || []
  const tot = data?.totals

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}><BrainAnimation opacity={0.4} fullscreen /></div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Topbar {...navProps} currentPage="aiUsage" onOpenChat={onGoToMessages} />
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 22px 60px' }}>
          <div style={{ marginBottom: 14 }}>
            <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>AI potrošnja</h1>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
              {data?.customer?.name ? `${data.customer.name} — potrošnja AI servisa po aplikacijama i modelima` : 'Potrošnja AI servisa vaše organizacije'}
            </div>
          </div>

          {data?.not_mapped ? (
            <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
              Vaš nalog još nije povezan sa AI potrošnjom. Kontaktirajte Intelisale tim da aktivira prikaz.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ ...card, padding: '12px 16px' }}>
                <FilterBar {...{ preset, setPreset, range, setRange, currency, setCurrency, exporting, loading }} onExport={exportXlsx} onExportPdf={exportPdf} />
              </div>

              {data?.rate_available === false && (
                <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                  Kurs za izabranu valutu trenutno nije dostupan — iznosi su u USD.
                </div>
              )}

              <AlertNotes alerts={alertNotes} compact />

              {budget?.has_budget && (
                <div style={{ ...card, ...(budget.level === 'limit' ? { borderColor: 'var(--red)', background: 'var(--redTint)' } : budget.level === 'warning' ? { borderColor: 'var(--amber)', background: 'var(--amberTint)' } : {}) }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>
                    Mesečni budžet — {budget.month}
                  </div>
                  <BudgetGauge name={budget.tenant_name} spent={budget.spent_eur} limit={budget.limit_eur} pct={budget.pct} level={budget.level} />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <Kpi title="Zahtevi" value={fmtNum(tot?.requests)} />
                <Kpi title="Tokeni" value={fmtTok(tot?.tokens)} />
                <Kpi title={`Trošak (${cur})`} value={fmtMoney(tot?.cost, cur)} color="var(--accent)" />
                <Kpi title="Aplikacije" value={apps.length} subtitle={`${models.length} modela`} />
              </div>

              <Section title="Dnevni trend" hint="trošak (linija) i zahtevi (stubići)">
                <TrendChart days={(data?.days || []).map(x => ({ date: x.date, requests: x.requests, cost: x.cost }))} currency={cur} height={230} />
              </Section>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
                <Section title="Trošak po aplikaciji">
                  <PieChart data={apps.map(a => ({ label: a.app, value: a.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={fmtMoney(tot?.cost, cur)} centerLabel="ukupno" />
                </Section>
                <Section title="Trošak po modelu">
                  <PieChart data={models.map(m => ({ label: m.model, value: m.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={`${models.length}`} centerLabel="modela" />
                </Section>
                <Section title="Zahtevi po aplikaciji" hint="top 10">
                  <HBars data={apps.map(a => ({ label: a.app, value: a.requests }))} valueFmt={fmtNum} color="#0D9488" />
                </Section>
                <Section title="Tokeni po modelu" hint="top 10">
                  <HBars data={models.map(m => ({ label: m.model, value: m.tokens }))} valueFmt={fmtTok} />
                </Section>
              </div>

              <SimpleTable title="Detalji po aplikaciji" rows={apps.map(a => ({ ...a, name: a.app }))} nameKey="name" cur={cur} />
              <SimpleTable title="Detalji po modelu" rows={models.map(m => ({ ...m, name: m.model }))} nameKey="name" cur={cur} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
