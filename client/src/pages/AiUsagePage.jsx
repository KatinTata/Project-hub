import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'
import Topbar from '../components/Topbar.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { PieChart, HBars, TrendChart, BudgetGauge, fmtTok, fmtNum, fmtMoney, colorAt } from '../components/aiCharts.jsx'

// ── shared styles / helpers ───────────────────────────────────────────────────

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }
const label = { fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const big = { fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 23, color: 'var(--text)' }
const sub = { fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }
const thStyle = { padding: '8px 12px', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--textMuted)', textAlign: 'left' }
const tdStyle = { padding: '8px 12px', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, color: 'var(--text)', borderTop: '1px solid var(--border)' }
const tdMono = { ...tdStyle, fontFamily: "'Hanken Grotesk'", fontSize: 12 }
const inputS = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, boxSizing: 'border-box' }
const btnS = { padding: '7px 16px', borderRadius: 8, fontSize: 13, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, border: '1px solid var(--borderHover)', background: 'var(--surfaceAlt)', color: 'var(--text)', cursor: 'pointer' }
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
const PRESETS = [['7d', 'ai2.preset.7d'], ['30d', 'ai2.preset.30d'], ['month', 'ai2.preset.month'], ['prevMonth', 'ai2.preset.prevMonth'], ['quarter', 'ai2.preset.quarter'], ['year', 'ai2.preset.year']]

function AlertNotes({ alerts, onAck, compact }) {
  const t = useT()
  if (!alerts?.length) return null
  const worst = alerts.some(a => a.level === 'limit') ? 'limit' : 'warning'
  const c = worst === 'limit' ? { border: 'var(--red)', bg: 'var(--redTint)', fg: 'var(--red)' } : { border: 'var(--amber)', bg: 'var(--amberTint)', fg: 'var(--amber)' }
  return (
    <div style={{ ...card, borderColor: c.border, background: c.bg }}>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 13, color: c.fg, marginBottom: 8 }}>
        {t('ai2.alerts.title', { n: alerts.length })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--text)' }}>
            <span style={{
              fontFamily: "'Hanken Grotesk'", fontSize: 9, padding: '1px 7px', borderRadius: 4, flexShrink: 0,
              background: a.level === 'limit' ? 'var(--red)' : 'var(--amber)', color: '#fff',
            }}>{a.level === 'limit' ? t('ai2.alerts.limit') : t('ai2.alerts.warning')}</span>
            <span style={{ flex: 1 }}>
              {!compact && <strong>{a.tenant_name}</strong>}{!compact && ' — '}
              {fmtMoney(a.spent_eur, 'EUR')} {t('ai2.of')} {fmtMoney(a.limit_eur, 'EUR')} ({Math.round(a.pct)}%) · {a.month}
              {a.mail_sent ? '' : ' · ' + t('ai2.alerts.mailNotSent')}
            </span>
            <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--textMuted)' }}>{String(a.created_at).slice(0, 16)}</span>
            {onAck && <button onClick={() => onAck(a.id)} title={t('ai2.alerts.markRead')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.fg, fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>}
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
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        {hint && <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>{hint}</span>}
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
async function openReportPdf(q, setBusy, t) {
  const w = window.open('', '_blank')
  if (w) w.document.write(`<p style="font-family:sans-serif;padding:24px;color:#5A6480">${t('ai2.report.generating')}</p>`)
  setBusy?.(true)
  try {
    const html = await api.aiUsageReportHtml(q)
    if (w) { w.document.open(); w.document.write(html); w.document.close() }
  } catch (e) {
    w?.close()
    alert(t('ai2.report.pdfError', { msg: e.message }))
  } finally { setBusy?.(false) }
}

function FilterBar({ preset, setPreset, range, setRange, onExport, onExportPdf, currency, setCurrency, exporting, loading }) {
  const t = useT()
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {PRESETS.map(([k, l]) => (
        <button key={k} onClick={() => { setPreset(k); setRange(presetRange(k)) }} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", cursor: 'pointer',
          border: preset === k ? '1px solid var(--accent)' : '1px solid var(--border)',
          background: preset === k ? 'var(--accent)' : 'var(--surfaceAlt)', color: preset === k ? '#fff' : 'var(--text)',
        }}>{t(l)}</button>
      ))}
      <input type="date" value={range.from} onChange={e => { setPreset(null); setRange(r => ({ ...r, from: e.target.value })) }} style={{ ...inputS, width: 138 }} />
      <input type="date" value={range.to} onChange={e => { setPreset(null); setRange(r => ({ ...r, to: e.target.value })) }} style={{ ...inputS, width: 138 }} />
      {setCurrency && (
        <select value={currency} onChange={e => setCurrency(e.target.value)} title={t('ai2.filter.currencyTitle')} style={{ ...inputS, width: 82 }}>
          {['USD', 'EUR', 'RSD'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <button onClick={onExport} disabled={exporting} style={{ ...btnS, background: '#0D9488', color: '#fff', border: 'none' }}>
        {exporting ? t('ai2.filter.exporting') : t('ai2.filter.excelReport')}
      </button>
      {onExportPdf && (
        <button onClick={onExportPdf} disabled={exporting} style={{ ...btnS, background: '#7C3AED', color: '#fff', border: 'none' }}>
          {t('ai2.filter.pdfReport')}
        </button>
      )}
      {loading && <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>{t('ai2.filter.loadingInline')}</span>}
    </div>
  )
}

export default function AiUsagePage(props) {
  const isAdminUser = props.user?.role === 'admin' || props.user?.role === 'super_admin'
  return isAdminUser ? <AdminAiView {...props} /> : <ClientAiView {...props} />
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────

function AdminAiView({ user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }) {
  const t = useT()
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
    catch (e) { alert(t('ai2.excelError', { msg: e.message })) }
    finally { setExporting(false) }
  }
  const exportPdf = () => openReportPdf(`${q}&currency=${currency}`, setExporting, t)

  const navProps = { user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }
  const tot = d.dash?.totals
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
              <h1 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>{t('ai2.admin.title')}</h1>
              <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
                {t('ai2.admin.subtitle')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['dashboard', t('ai2.view.dashboard')], ['report', t('ai2.view.reportByClient')], ...(isSuperAdmin ? [['settings', t('settings.title')]] : [])].map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", cursor: 'pointer',
                  background: view === k ? 'var(--accent)' : 'transparent', color: view === k ? '#fff' : 'var(--textMuted)',
                  border: view === k ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {notConfigured && (
            <div style={{ ...card, borderColor: 'var(--amber)', background: 'var(--amberTint)', color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, marginBottom: 14 }}>
              {t('ai2.notConfigured')} {isSuperAdmin ? t('ai2.notConfigured.super') : t('ai2.notConfigured.nonSuper')}
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
                  <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 13, color: alerts.some(a => a.status.level === 'limit') ? 'var(--red)' : 'var(--amber)', marginBottom: 6 }}>
                    {alerts.length === 1 ? t('ai2.budget.attentionTitle.singular', { n: alerts.length, month: budgets?.month }) : t('ai2.budget.attentionTitle.plural', { n: alerts.length, month: budgets?.month })}
                  </div>
                  {alerts.map(a => (
                    <div key={a.tenant_id} style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--text)', padding: '2px 0' }}>
                      <strong>{a.tenant_name}</strong> — {fmtMoney(a.status.spent_eur, 'EUR')} {t('ai2.of')} {fmtMoney(a.status.limit_eur, 'EUR')} ({Math.round(a.status.pct)}%)
                      {a.status.level === 'limit' ? ' — ' + t('ai2.budget.limitExceeded') : ' — ' + t('ai2.budget.nearLimit')}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <Kpi title={t('ai2.requests')} value={tot ? fmtNum(tot.requests) : '—'} subtitle={d.dash?.today ? t('ai2.kpi.today', { n: fmtNum(d.dash.today.requests) }) : ''} />
                <Kpi title={t('ai2.kpi.costOurPrice')} value={tot ? fmtMoney(tot.total_cost_usd) : '—'} color="var(--accent)" subtitle={tot?.avg_cost_per_req != null ? t('ai2.kpi.perRequest', { v: fmtMoney(tot.avg_cost_per_req) }) : ''} />
                <Kpi title={t('ai2.tokens')} value={tot ? fmtTok(tot.total_tokens) : '—'} subtitle={tot ? t('ai2.kpi.tokensInOut', { in: fmtTok(tot.prompt_tokens), out: fmtTok(tot.completion_tokens) }) : ''} />
                <Kpi title={t('ai2.kpi.activeClients')} value={d.dash ? d.dash.active_clients : '—'} subtitle={t('ai2.kpi.inPeriod', { n: clients.length })} />
                <Kpi title={t('ai2.kpi.errors')} value={tot ? fmtNum(tot.error_count) : '—'} color={tot?.error_count > 0 ? 'var(--red)' : 'var(--green)'} subtitle={tot ? t('ai2.kpi.successCount', { n: fmtNum(tot.success_count) }) : ''} />
                <Kpi title={t('ai2.kpi.avgDuration')} value={tot ? `${Math.round(tot.avg_duration_ms)} ms` : '—'} subtitle={t('ai2.kpi.perRequestSub')} />
              </div>

              {d.dash?.unpriced_models?.length > 0 && (
                <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
                  {t('ai2.unpricedModels', { list: d.dash.unpriced_models.join(', ') })}
                </div>
              )}

              <Section title={t('ai2.section.dailyTrend')} hint={t('ai2.section.dailyTrendHint')}>
                <TrendChart days={(d.trends?.days || []).map(x => ({ date: x.date, requests: x.requests, cost: x.cost_usd }))} currency="USD" height={230} />
              </Section>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
                <Section title={t('ai2.section.costByClient')} hint={t('ai2.section.costByClientHint')}>
                  <PieChart data={clients.map(c => ({ label: c.name, value: c.cost_usd }))} valueFmt={v => fmtMoney(v)} centerValue={fmtMoney(tot?.total_cost_usd)} centerLabel={t('ai2.center.total')} />
                </Section>
                <Section title={t('ai2.section.costBySource')} hint={t('ai2.section.costBySourceHint')}>
                  <PieChart data={sources.map((s, i) => ({ label: s.source, value: s.cost_usd, color: colorAt(i + 2) }))} valueFmt={v => fmtMoney(v)} centerValue={`${sources.length}`} centerLabel={t('ai2.center.sources')} />
                </Section>
                <Section title={t('ai2.section.costByModel')}>
                  <PieChart data={models.map(m => ({ label: m.model, value: m.cost_usd }))} valueFmt={v => fmtMoney(v)} centerValue={`${models.length}`} centerLabel={t('ai2.center.models')} />
                </Section>
                <Section title={t('ai2.section.tokensInOut')}>
                  <PieChart
                    data={[
                      { label: t('ai2.label.promptInput'), value: tot?.prompt_tokens || 0, color: '#2563EB' },
                      { label: t('ai2.label.completionOutput'), value: tot?.completion_tokens || 0, color: '#7C3AED' },
                    ]}
                    valueFmt={fmtTok} centerValue={fmtTok(tot?.total_tokens)} centerLabel={t('ai2.center.tokens')} />
                </Section>
                <Section title={t('ai2.section.requestsByClient')} hint={t('ai2.top10')}>
                  <HBars data={clients.map(c => ({ label: c.name, value: c.requests }))} valueFmt={fmtNum} />
                </Section>
                <Section title={t('ai2.section.costByApp')} hint={d.byApp?.truncated ? t('ai2.hint.first40') : t('ai2.top10')}>
                  <HBars data={apps.map(a => ({ label: a.app, value: a.cost_usd }))} valueFmt={v => fmtMoney(v)} color="#0D9488" />
                </Section>
              </div>

              {gauges.length > 0 && (
                <Section title={t('ai2.section.budgetsCurrentMonth')} hint={t('ai2.hint.spentVsLimit', { month: budgets?.month })}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                    {gauges.map(b => (
                      <BudgetGauge key={b.tenant_id} name={b.package_name ? `${b.tenant_name} · ${b.package_name}` : b.tenant_name} spent={b.status.spent_eur} limit={b.status.limit_eur} pct={b.status.pct} level={b.status.level} />
                    ))}
                  </div>
                </Section>
              )}

              <PivotTable title={t('ai2.pivot.byClients')} rows={clients} childKey="sources" childName={r => r.source} nameKey="name" idKey="key" expanded={expanded} setExpanded={setExpanded} />
              <PivotTable title={t('ai2.pivot.bySource')} rows={sources} childKey="clients" childName={r => r.name} nameKey="source" idKey="source" expanded={expanded} setExpanded={setExpanded} />
              <SimpleTable title={t('ai2.table.byApps')} rows={apps} nameKey="app" costKey="cost_usd" />
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
  const t = useT()
  if (!rows?.length) return null
  const total = rows.reduce((s, r) => s + r.cost_usd, 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--textMuted)' }}>{t('ai2.total', { v: fmtMoney(total) })}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>{t('ai2.name')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.requests')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.tokens')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.cost')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.share')}</th>
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
  const t = useT()
  if (!rows?.length) return null
  const total = rows.reduce((s, r) => s + (r[costKey] || 0), 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--textMuted)' }}>{t('ai2.total', { v: fmtMoney(total, cur) })}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>{t('ai2.name')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.requests')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.tokens')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.cost')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.share')}</th>
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
  const t = useT()
  if (!rows?.length) return null
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{t('ai2.table.byModel')}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>{t('ai2.model')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.requests')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.input')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.output')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.cost')}</th>
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.model}>
            <td style={tdStyle}>
              {r.model}
              {!r.priced && <span title={t('ai2.model.noPriceTitle')} style={{ marginLeft: 8, fontFamily: "'Hanken Grotesk'", fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--amberTint)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>{t('ai2.model.noPrice')}</span>}
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
  const t = useT()
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
    catch (e) { alert(t('ai2.error', { msg: e.message })) }
    finally { setBusy(false) }
  }

  function exportPdf() {
    if (!report) return
    const cur = report.currency
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const money = v => fmtMoney(v, cur)
    const rowsHtml = (arr, cols) => arr.map(r => `<tr>${cols.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #E2E6F0;${c.right ? 'text-align:right' : ''}">${esc(c.v(r))}</td>`).join('')}</tr>`).join('')
    const table = (title, head, body) => body ? `
      <h2 style="font-size:15px;margin:26px 0 8px;color:#0F2746;border-bottom:2px solid #38BDF8;padding-bottom:6px">${title}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${head.map(h => `<th style="text-align:${h.right ? 'right' : 'left'};padding:6px 10px;background:#F0F2F8;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#5A6480">${h.t}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody></table>` : ''
    const cols = [{ v: r => r.name }, { v: r => fmtNum(r.requests), right: 1 }, { v: r => fmtTok(r.tokens), right: 1 }, { v: r => money(r.cost), right: 1 }]
    const head = [{ t: t('ai2.name') }, { t: t('ai2.requests'), right: 1 }, { t: t('ai2.tokens'), right: 1 }, { t: t('ai2.cost'), right: 1 }]
    const html = `<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8"><title>${esc(t('ai2.pdf.docTitle', { name: report.customer?.name }))}</title>
      <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Hanken Grotesk','Segoe UI',Arial,sans-serif;color:#0F1523;max-width:820px;margin:0 auto;padding:28px}@page{size:A4;margin:0}@media print{.noprint{display:none}body{padding:12mm 14mm}}</style></head><body>
      <div class="noprint" style="text-align:right;margin-bottom:12px"><button onclick="window.print()" style="background:#7C3AED;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-weight:600;cursor:pointer">${esc(t('ai2.pdf.savePdf'))}</button></div>
      <div style="background:linear-gradient(135deg,#0b1a2f,#0f2746 55%,#163e6b);border-radius:16px;padding:24px 28px;color:#fff;margin-bottom:8px">
        <div style="font-size:11px;letter-spacing:0.16em;color:#38BDF8;margin-bottom:8px">${esc(t('ai2.pdf.headerLabel'))}</div>
        <div style="font-size:24px;font-weight:800">${esc(report.customer?.name)}</div>
        <div style="font-size:12px;color:#9FB2C9;margin-top:8px">${esc(t('ai2.pdf.period', { from: String(report.period?.from).slice(0, 10), to: String(report.period?.to).slice(0, 10), cur }))}${report.rate_available === false ? esc(t('ai2.pdf.rateUnavailableSuffix')) : ''}</div>
        <div style="display:flex;gap:36px;margin-top:16px">
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">${esc(t('ai2.requests').toUpperCase())}</div><div style="font-size:18px;font-weight:700">${fmtNum(report.totals?.requests)}</div></div>
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">${esc(t('ai2.tokens').toUpperCase())}</div><div style="font-size:18px;font-weight:700">${fmtTok(report.totals?.tokens)}</div></div>
          <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">${esc(t('ai2.pdf.totalCost'))}</div><div style="font-size:18px;font-weight:700">${money(report.totals?.cost)}</div></div>
        </div>
      </div>
      ${table(t('ai2.section.byModel'), head, rowsHtml((report.models || []).map(r => ({ ...r, name: r.model })), cols))}
      ${table(t('ai2.section.bySource'), head, rowsHtml((report.bySource || []).map(r => ({ ...r, name: r.source })), cols))}
      ${table(t('ai2.section.byApp'), head, rowsHtml((report.byApp || []).map(r => ({ ...r, name: r.app })), cols))}
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
          <option value="">{t('ai2.selectCustomer')}</option>
          {(tenants || []).map(x => <option key={x.tenant_guid} value={x.tenant_guid}>{x.name}{x.code ? ` (${x.code})` : ''}</option>)}
        </select>
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputS, width: 88 }}>
          {['USD', 'EUR', 'RSD'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {PRESETS.slice(1, 5).map(([k, l]) => (
          <button key={k} onClick={() => { setPreset(k); setRange(presetRange(k)) }} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", cursor: 'pointer',
            border: preset === k ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: preset === k ? 'var(--accent)' : 'var(--surfaceAlt)', color: preset === k ? '#fff' : 'var(--text)',
          }}>{t(l)}</button>
        ))}
        <button onClick={load} disabled={!tenantGuid || busy} style={btnPrimary}>{busy ? t('ai2.loading') : t('ai2.load')}</button>
        {report && <button onClick={exportPdf} style={{ ...btnS, background: '#7C3AED', color: '#fff', border: 'none' }}>{t('ai2.exportPdf')}</button>}
        <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>{range.from} — {range.to}</span>
      </div>

      {report && (
        <>
          {report.rate_available === false && (
            <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
              {t('ai2.report.rateUnavailable')}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi title={t('ai2.kpi.customer')} value={<span style={{ fontSize: 17 }}>{report.customer?.name}</span>} />
            <Kpi title={t('ai2.requests')} value={fmtNum(report.totals?.requests)} />
            <Kpi title={t('ai2.tokens')} value={fmtTok(report.totals?.tokens)} />
            <Kpi title={t('ai2.costCur', { cur })} value={fmtMoney(report.totals?.cost, cur)} color="var(--accent)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
            <Section title={t('ai2.section.byModel')}><PieChart data={(report.models || []).map(m => ({ label: m.model, value: m.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={fmtMoney(report.totals?.cost, cur)} centerLabel={t('ai2.center.total')} /></Section>
            <Section title={t('ai2.section.byApp')}><PieChart data={(report.byApp || []).map(a => ({ label: a.app, value: a.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={`${(report.byApp || []).length}`} centerLabel={t('ai2.center.apps')} /></Section>
          </div>
          <SimpleTable title={t('ai2.section.byModel')} rows={(report.models || []).map(m => ({ ...m, name: m.model }))} nameKey="name" cur={cur} />
          <SimpleTable title={t('ai2.section.bySource')} rows={(report.bySource || []).map(s => ({ ...s, name: s.source }))} nameKey="name" cur={cur} />
          <SimpleTable title={t('ai2.section.byApp')} rows={(report.byApp || []).map(a => ({ ...a, name: a.app }))} nameKey="name" cur={cur} />
        </>
      )}
    </div>
  )
}

// ── Podešavanja (super_admin): API, cenovnik, mapiranje, budžeti ──────────────

function SettingsView() {
  const t = useT()
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

  const wrap = fn => async (...a) => { setBusy(true); try { await fn(...a); await reload() } catch (e) { alert(t('ai2.error', { msg: e.message })) } finally { setBusy(false) } }
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

  if (!cfg) return <div style={{ padding: 20, color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>{t('ai2.loading')}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title={t('ai2.settings.apiSection')}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://intelisale-agentic.azurewebsites.net" style={{ ...inputS, flex: '1 1 320px' }} />
          <input value={keyInput} onChange={e => setKeyInput(e.target.value)} type="password" placeholder={cfg.has_password ? t('ai2.settings.masterKeyPlaceholderSet') : t('ai2.settings.masterKeyPlaceholder')} style={{ ...inputS, flex: '1 1 250px' }} />
          <button onClick={test} disabled={busy} style={btnS}>{t('settings.jira.test')}</button>
          <button onClick={saveConfig} disabled={busy} style={btnPrimary}>{t('settings.jira.save')}</button>
        </div>
        {(testMsg || cfg.last_test_message) && (
          <div style={{ marginTop: 8, fontFamily: "'Hanken Grotesk'", fontSize: 12, color: (testMsg ? testMsg.ok : cfg.last_test_ok) ? 'var(--green)' : 'var(--red)' }}>
            {testMsg ? testMsg.message : cfg.last_test_message}
          </div>
        )}
      </Section>

      <Section
        title={t('ai2.settings.pricing')}
        hint={cfg.pricing?.last_sync_message ? t('ai2.settings.lastSync', { msg: cfg.pricing.last_sync_message }) : t('ai2.settings.basePricesHint')}
        right={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t('ai2.settings.globalMarkup')}
              <input value={globalMarkup} onChange={e => setGlobalMarkup(e.target.value)} type="number" step="0.5" style={{ ...inputS, width: 74 }} />
            </label>
            <button onClick={saveMarkup} disabled={busy} style={btnS}>{t('ai2.settings.saveMarkup')}</button>
            <button onClick={fetchFx} disabled={busy} style={btnS}>{t('ai2.settings.fetchRates')}</button>
            <button onClick={runSync} disabled={busy} style={btnPrimary}>{busy ? t('ai2.settings.working') : t('ai2.settings.syncAzure')}</button>
          </span>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
              <th style={thStyle}>{t('ai2.model')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.settings.col.baseIn')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.settings.col.baseOut')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.settings.col.markup')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.settings.col.finalIn')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.settings.col.finalOut')}</th><th style={thStyle}>{t('ai2.settings.col.source')}</th><th style={thStyle} />
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
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{e && <button onClick={() => saveModel(m.model_name)} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11 }}>{t('settings.jira.save')}</button>}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        {(models?.models || []).length === 0 && <div style={{ padding: 18, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>{t('ai2.settings.noModels')}</div>}
        <button onClick={toggleHistory} style={{ marginTop: 10, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)', padding: 0 }}>
          <span style={{ display: 'inline-block', transform: histOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', marginRight: 8 }}>▸</span>{t('ai2.settings.priceHistory')}
        </button>
        {histOpen && (
          <div style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
            {(history || []).map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 10, padding: '4px 0', borderTop: '1px solid var(--border)', fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text)', minWidth: 110 }}>{h.model_name}</span>
                <span>{t('ai2.in')} {h.old_input_per_1m ?? '—'} → {h.new_input_per_1m}</span>
                <span>{t('ai2.out')} {h.old_output_per_1m ?? '—'} → {h.new_output_per_1m}</span>
                <span>{h.source} · {h.changed_by}</span>
                <span style={{ marginLeft: 'auto' }}>{String(h.changed_at).slice(0, 16)}</span>
              </div>
            ))}
            {(history || []).length === 0 && <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>{t('ai2.settings.noChanges')}</div>}
          </div>
        )}
      </Section>

      <MappingsCard />
      <PackagesCard />
      <BudgetsCard />
    </div>
  )
}

// ── AI paketi (tieri): fiksni pristup + uključena potrošnja ──────────────────
function PackagesCard() {
  const t = useT()
  const [packages, setPackages] = useState([])
  const [edit, setEdit] = useState({})
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    try { setPackages((await api.aiUsagePackages()).packages || []) } catch { setPackages([]) }
  }, [])
  useEffect(() => { reload() }, [reload])

  const savePkg = async (id) => {
    const p = packages.find(x => x.id === id)
    const e = edit[id] || {}
    setBusy(true)
    try {
      await api.aiUsageUpdatePackage(id, {
        name: e.name ?? p.name,
        monthly_fee_eur: e.monthly_fee_eur ?? p.monthly_fee_eur,
        included_eur: e.included_eur ?? p.included_eur,
        sort_order: e.sort_order ?? p.sort_order,
        is_active: (e.is_active ?? p.is_active) ? true : false,
      })
      setEdit(prev => { const n = { ...prev }; delete n[id]; return n })
      await reload()
    } catch (err) { alert(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
  }
  const createPkg = async () => {
    if (!draft?.name?.trim()) { alert(t('ai2.packages.enterName')); return }
    setBusy(true)
    try { await api.aiUsageCreatePackage(draft); setDraft(null); await reload() }
    catch (err) { alert(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
  }
  const removePkg = async (id, name) => {
    if (!confirm(t('ai2.packages.deleteConfirm', { name }))) return
    setBusy(true)
    try { await api.aiUsageDeletePackage(id); await reload() }
    catch (err) { alert(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
  }

  const numIn = (v, onCh, w = 90) => (
    <input type="number" step="10" min="0" value={v} onChange={onCh} style={{ ...inputS, width: w, textAlign: 'right', padding: '3px 6px' }} />
  )

  return (
    <Section
      title={t('ai2.packages.title')}
      hint={t('ai2.packages.hint')}
      right={!draft && <button onClick={() => setDraft({ name: '', monthly_fee_eur: 0, included_eur: 0 })} style={btnPrimary}>{t('ai2.packages.new')}</button>}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
            <th style={thStyle}>{t('ai2.name')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.packages.access')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.packages.includedUsage')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.packages.totalPerMonth')}</th>
            <th style={thStyle}>{t('ai2.active')}</th>
            <th style={thStyle} />
          </tr></thead>
          <tbody>
            {packages.map(p => {
              const e = edit[p.id] || {}
              const val = (k, def) => (e[k] !== undefined ? e[k] : def)
              const set = (k, v) => setEdit(prev => ({ ...prev, [p.id]: { ...prev[p.id], [k]: v } }))
              const total = (Number(val('monthly_fee_eur', p.monthly_fee_eur)) || 0) + (Number(val('included_eur', p.included_eur)) || 0)
              return (
                <tr key={p.id} style={{ opacity: val('is_active', p.is_active) ? 1 : 0.45 }}>
                  <td style={tdStyle}>
                    <input value={val('name', p.name)} onChange={ev => set('name', ev.target.value)} style={{ ...inputS, width: 120, padding: '3px 8px', fontWeight: 600 }} />
                  </td>
                  <td style={{ ...tdMono, textAlign: 'right' }}>{numIn(val('monthly_fee_eur', p.monthly_fee_eur), ev => set('monthly_fee_eur', ev.target.value))}</td>
                  <td style={{ ...tdMono, textAlign: 'right' }}>{numIn(val('included_eur', p.included_eur), ev => set('included_eur', ev.target.value))}</td>
                  <td style={{ ...tdMono, textAlign: 'right', fontWeight: 700 }}>{fmtMoney(total, 'EUR')}</td>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={!!val('is_active', p.is_active)} onChange={ev => set('is_active', ev.target.checked)} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {Object.keys(e).length > 0 && <button onClick={() => savePkg(p.id)} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11 }}>{t('settings.jira.save')}</button>}
                    <button onClick={() => removePkg(p.id, p.name)} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11, color: 'var(--red)', marginLeft: 6 }}>{t('rn.delete')}</button>
                  </td>
                </tr>
              )
            })}
            {draft && (
              <tr style={{ background: 'var(--surfaceAlt)' }}>
                <td style={tdStyle}>
                  <input autoFocus value={draft.name} placeholder={t('ai2.packages.namePlaceholder')} onChange={ev => setDraft(d => ({ ...d, name: ev.target.value }))} style={{ ...inputS, width: 120, padding: '3px 8px', fontWeight: 600 }} />
                </td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{numIn(draft.monthly_fee_eur, ev => setDraft(d => ({ ...d, monthly_fee_eur: ev.target.value })))}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{numIn(draft.included_eur, ev => setDraft(d => ({ ...d, included_eur: ev.target.value })))}</td>
                <td style={{ ...tdMono, textAlign: 'right', fontWeight: 700 }}>{fmtMoney((Number(draft.monthly_fee_eur) || 0) + (Number(draft.included_eur) || 0), 'EUR')}</td>
                <td style={tdStyle} />
                <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={createPkg} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none' }}>{t('ai2.addBtn')}</button>
                  <button onClick={() => setDraft(null)} style={{ ...btnS, padding: '3px 10px', fontSize: 11, marginLeft: 6 }}>{t('tabs.cancel')}</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {packages.length === 0 && !draft && (
        <div style={{ padding: 18, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>
          {t('ai2.packages.empty')}
        </div>
      )}
    </Section>
  )
}

function MappingsCard() {
  const t = useT()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => setData(await api.aiUsageMappings()), [])
  useEffect(() => { reload() }, [reload])

  async function discover() {
    setBusy(true)
    try { await api.aiUsageDiscover(); await reload() }
    catch (e) { alert(t('ai2.error', { msg: e.message })) }
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
      title={t('ai2.mappings.title')}
      hint={t('ai2.mappings.hint')}
      right={<button onClick={discover} disabled={busy} style={btnPrimary}>{busy ? t('ai2.settings.working') : t('ai2.mappings.fetchTenants')}</button>}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>{t('ai2.tenant')}</th><th style={thStyle}>{t('ai2.code')}</th><th style={thStyle}>{t('ai2.mappings.tracked')}</th><th style={thStyle}>{t('ai2.mappings.clientAccounts')}</th>
        </tr></thead>
        <tbody>{(data?.mappings || []).map(m => (
          <tr key={m.tenant_id} style={{ opacity: m.is_tracked ? 1 : 0.45 }}>
            <td style={tdStyle}>{m.tenant_name || m.tenant_id}</td>
            <td style={tdMono}>{m.tenant_code || '—'}</td>
            <td style={tdStyle}>
              <button onClick={() => setTracked(m.tenant_id, !m.is_tracked)} title={t('ai2.mappings.trackTitle')}
                style={{
                  padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", cursor: 'pointer',
                  border: `1px solid ${m.is_tracked ? 'var(--green)' : 'var(--border)'}`,
                  background: m.is_tracked ? 'var(--greenTint)' : 'transparent',
                  color: m.is_tracked ? 'var(--green)' : 'var(--textMuted)',
                }}>{m.is_tracked ? t('ai2.mappings.active') : t('ai2.mappings.inactive')}</button>
            </td>
            <td style={tdStyle}><MultiUserPicker tenant={m} clients={data?.clients || []} onToggle={toggleUser} /></td>
          </tr>
        ))}</tbody>
      </table>
      {(data?.mappings || []).length === 0 && <div style={{ padding: 18, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>{t('ai2.mappings.noTenants')}</div>}
    </Section>
  )
}

function MultiUserPicker({ tenant, clients, onToggle }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const assigned = new Set((tenant.users || []).map(u => u.id))
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {(tenant.users || []).map(u => (
          <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--text)' }}>
            {u.name}
            <button onClick={() => onToggle(tenant, u.id)} title={t('ai2.remove')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--textMuted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <button onClick={() => setOpen(o => !o)} style={{ background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600 }}>
          {open ? t('settings.close') : t('ai2.add')}
        </button>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxHeight: 240, overflowY: 'auto', minWidth: 270 }}>
          {clients.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--text)' }}>
              <input type="checkbox" checked={assigned.has(c.id)} onChange={() => onToggle(tenant, c.id)} />
              <span>{c.name}</span>
              <span style={{ color: 'var(--textMuted)', marginLeft: 'auto', fontSize: 11 }}>{c.email}</span>
            </label>
          ))}
          {clients.length === 0 && <div style={{ padding: '8px 10px', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>{t('ai2.mappings.noClientAccounts')}</div>}
        </div>
      )}
    </div>
  )
}

function BudgetsCard() {
  const t = useT()
  const [data, setData] = useState(null)
  const [packages, setPackages] = useState([])
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState({})
  const reload = useCallback(async () => {
    setData(await api.aiUsageBudgets())
    try { setPackages((await api.aiUsagePackages()).packages || []) } catch { setPackages([]) }
  }, [])
  useEffect(() => { reload() }, [reload])

  const save = async b => {
    const e = edit[b.tenant_id] || {}
    setBusy(true)
    try {
      // merge current values so a partial edit never wipes the other fields
      await api.aiUsageSaveBudget(b.tenant_id, {
        monthly_limit_eur: b.monthly_limit_eur ?? '',
        warning_pct: b.warning_pct,
        notify_enabled: b.notify_enabled,
        extra_emails: b.extra_emails || '',
        package_id: b.package_id ?? '',
        ...e,
      })
      setEdit(p => { const n = { ...p }; delete n[b.tenant_id]; return n })
      await reload()
    } catch (err) { alert(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
  }
  const runCheck = async () => {
    setBusy(true)
    try {
      const r = await api.aiUsageCheckBudgets()
      alert(r.mail_configured
        ? t('ai2.budgets.checkResult', { n: r.results.filter(x => x.mail?.ok).length })
        : t('ai2.budgets.smtpNotConfigured'))
      await reload()
    } catch (e) { alert(t('ai2.error', { msg: e.message })) } finally { setBusy(false) }
  }

  return (
    <Section
      title={t('ai2.budgets.title')}
      hint={data ? t('ai2.budgets.hint', { month: data.month, smtp: data.mail_configured ? t('ai2.budgets.smtpOn') : t('ai2.budgets.smtpOff') }) : ''}
      right={<button onClick={runCheck} disabled={busy} style={btnS}>{t('ai2.budgets.checkNow')}</button>}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1050 }}>
          <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
            <th style={thStyle}>{t('ai2.tenant')}</th>
            <th style={thStyle}>{t('ai2.package')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.budgets.monthlyLimit')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.budgets.warningPct')}</th>
            <th style={thStyle}>{t('ai2.budgets.mail')}</th>
            <th style={thStyle}>{t('ai2.budgets.extraRecipients')}</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.spent')}</th>
            <th style={thStyle} />
          </tr></thead>
          <tbody>{(data?.budgets || []).map(b => {
            const e = edit[b.tenant_id] || {}
            const val = (k, def) => (e[k] !== undefined ? e[k] : def)
            const set = (k, v) => setEdit(p => ({ ...p, [b.tenant_id]: { ...p[b.tenant_id], [k]: v } }))
            const st = b.status
            const stColor = st?.level === 'limit' ? 'var(--red)' : st?.level === 'warning' ? 'var(--amber)' : 'var(--green)'
            const pkgId = val('package_id', b.package_id ?? '')
            const pkg = packages.find(p => String(p.id) === String(pkgId))
            return (
              <tr key={b.tenant_id}>
                <td style={tdStyle}>{b.tenant_name || b.tenant_id}</td>
                <td style={tdStyle}>
                  <select value={pkgId ?? ''} onChange={ev => set('package_id', ev.target.value)} style={{ ...inputS, width: 130, padding: '3px 6px', fontSize: 12 }}>
                    <option value="">{t('ai2.budgets.noPackage')}</option>
                    {packages.filter(p => p.is_active || String(p.id) === String(pkgId)).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({fmtMoney((p.monthly_fee_eur || 0) + (p.included_eur || 0), 'EUR')})</option>
                    ))}
                  </select>
                </td>
                <td style={{ ...tdMono, textAlign: 'right' }}>
                  {pkg ? (
                    <span title={t('ai2.budgets.limitFromPackage')} style={{ color: 'var(--textMuted)' }}>{fmtMoney(pkg.included_eur, 'EUR')}</span>
                  ) : (
                    <input type="number" step="10" min="0" placeholder="—" value={val('monthly_limit_eur', b.monthly_limit_eur ?? '')}
                      onChange={ev => set('monthly_limit_eur', ev.target.value)} style={{ ...inputS, width: 96, textAlign: 'right', padding: '3px 6px' }} />
                  )}
                </td>
                <td style={{ ...tdMono, textAlign: 'right' }}>
                  <input type="number" step="5" min="1" max="100" value={val('warning_pct', b.warning_pct)}
                    onChange={ev => set('warning_pct', ev.target.value)} style={{ ...inputS, width: 62, textAlign: 'right', padding: '3px 6px' }} />
                </td>
                <td style={tdStyle}>
                  <input type="checkbox" checked={!!val('notify_enabled', b.notify_enabled)} onChange={ev => set('notify_enabled', ev.target.checked)} />
                </td>
                <td style={tdStyle}>
                  <input placeholder={t('ai2.budgets.extraEmailsPlaceholder')} value={val('extra_emails', b.extra_emails || '')}
                    onChange={ev => set('extra_emails', ev.target.value)} style={{ ...inputS, width: 200, padding: '3px 8px', fontSize: 12 }} />
                </td>
                <td style={{ ...tdMono, textAlign: 'right', color: stColor }}>
                  {st ? `${fmtMoney(st.spent_eur, 'EUR')}${st.pct != null ? ` · ${Math.round(st.pct)}%` : ''}` : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {Object.keys(e).length > 0 && <button onClick={() => save(b)} disabled={busy} style={{ ...btnS, padding: '3px 10px', fontSize: 11 }}>{t('settings.jira.save')}</button>}
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {(data?.budgets || []).length === 0 && <div style={{ padding: 18, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13 }}>{t('ai2.budgets.noTenants')}</div>}
    </Section>
  )
}

// ── KLIJENT ───────────────────────────────────────────────────────────────────

function ClientAiView({ user, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, onGoToAiUsage }) {
  const t = useT()
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
    catch (e) { alert(t('ai2.excelError', { msg: e.message })) }
    finally { setExporting(false) }
  }
  const exportPdf = () => openReportPdf(`from=${range.from}&to=${range.to}&currency=${currency}`, setExporting, t)

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
            <h1 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>{t('ai2.client.title')}</h1>
            <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
              {data?.customer?.name ? t('ai2.client.subtitle', { name: data.customer.name }) : t('ai2.client.subtitleGeneric')}
            </div>
          </div>

          {data?.not_mapped ? (
            <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 14 }}>
              {t('ai2.client.notMapped')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ ...card, padding: '12px 16px' }}>
                <FilterBar {...{ preset, setPreset, range, setRange, currency, setCurrency, exporting, loading }} onExport={exportXlsx} onExportPdf={exportPdf} />
              </div>

              {data?.rate_available === false && (
                <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
                  {t('ai2.client.rateUnavailable')}
                </div>
              )}

              <AlertNotes alerts={alertNotes} compact />

              {budget?.has_budget && (
                <div style={{ ...card, ...(budget.level === 'limit' ? { borderColor: 'var(--red)', background: 'var(--redTint)' } : budget.level === 'warning' ? { borderColor: 'var(--amber)', background: 'var(--amberTint)' } : {}) }}>
                  {budget.package ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {t('ai2.client.yourPackage')}
                          <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#fff', borderRadius: 6, padding: '2px 10px' }}>
                            {budget.package.name}
                          </span>
                        </div>
                        <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                          {t('ai2.client.perMonth', { v: fmtMoney(budget.package.fee_eur + budget.package.included_eur, 'EUR') })}
                          <span style={{ fontSize: 11, color: 'var(--textMuted)', marginLeft: 8 }}>
                            {t('ai2.client.accessPlusUsage', { fee: fmtMoney(budget.package.fee_eur, 'EUR'), included: fmtMoney(budget.package.included_eur, 'EUR') })}
                          </span>
                        </div>
                      </div>
                      <BudgetGauge name={t('ai2.client.includedUsageMonth', { month: budget.month })} spent={budget.spent_eur} limit={budget.limit_eur} pct={budget.pct} level={budget.level} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 6, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
                        <span>
                          {budget.overage_eur > 0
                            ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{t('ai2.client.overage', { v: fmtMoney(budget.overage_eur, 'EUR') })}</span>
                            : t('ai2.client.remaining', { v: fmtMoney(Math.max(0, (budget.limit_eur || 0) - budget.spent_eur), 'EUR') })}
                        </span>
                        <span>{t('ai2.client.resetsMonthly')}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>
                        {t('ai2.client.monthlyBudget', { month: budget.month })}
                      </div>
                      <BudgetGauge name={budget.tenant_name} spent={budget.spent_eur} limit={budget.limit_eur} pct={budget.pct} level={budget.level} />
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <Kpi title={t('ai2.requests')} value={fmtNum(tot?.requests)} />
                <Kpi title={t('ai2.tokens')} value={fmtTok(tot?.tokens)} />
                <Kpi title={t('ai2.costCur', { cur })} value={fmtMoney(tot?.cost, cur)} color="var(--accent)" />
                <Kpi title={t('ai2.kpi.apps')} value={apps.length} subtitle={t('ai2.kpi.modelsCount', { n: models.length })} />
              </div>

              <Section title={t('ai2.section.dailyTrend')} hint={t('ai2.section.dailyTrendHint')}>
                <TrendChart days={(data?.days || []).map(x => ({ date: x.date, requests: x.requests, cost: x.cost }))} currency={cur} height={230} />
              </Section>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
                <Section title={t('ai2.section.costByApp')}>
                  <PieChart data={apps.map(a => ({ label: a.app, value: a.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={fmtMoney(tot?.cost, cur)} centerLabel={t('ai2.center.total')} />
                </Section>
                <Section title={t('ai2.section.costByModel')}>
                  <PieChart data={models.map(m => ({ label: m.model, value: m.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={`${models.length}`} centerLabel={t('ai2.center.models')} />
                </Section>
                <Section title={t('ai2.section.requestsByApp')} hint={t('ai2.top10')}>
                  <HBars data={apps.map(a => ({ label: a.app, value: a.requests }))} valueFmt={fmtNum} color="#0D9488" />
                </Section>
                <Section title={t('ai2.section.tokensByModel')} hint={t('ai2.top10')}>
                  <HBars data={models.map(m => ({ label: m.model, value: m.tokens }))} valueFmt={fmtTok} />
                </Section>
              </div>

              <SimpleTable title={t('ai2.table.byApp')} rows={apps.map(a => ({ ...a, name: a.app }))} nameKey="name" cur={cur} />
              <SimpleTable title={t('ai2.table.byModel')} rows={models.map(m => ({ ...m, name: m.model }))} nameKey="name" cur={cur} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
