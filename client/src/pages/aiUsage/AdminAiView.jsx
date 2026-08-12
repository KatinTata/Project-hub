import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import Topbar from '../../components/Topbar.jsx'
import BrainAnimation from '../../components/BrainAnimation.jsx'
import { PieChart, HBars, TrendChart, BudgetGauge, fmtTok, fmtNum, fmtMoney, colorAt } from '../../components/aiCharts.jsx'
import { toast } from '../../ui/Toast.jsx'
import { card, presetRange, AlertNotes, Section, Kpi, FilterBar, openReportPdf } from './ui.jsx'
import { PivotTable, SimpleTable, ModelsTable } from './tables.jsx'
import ReportView from './ReportView.jsx'
import SettingsView from './SettingsView.jsx'

// Admin dashboard: KPI-jevi, trendovi, pite/barovi, budžeti, pivot tabele +
// tabovi za izveštaj po kupcu i (super_admin) podešavanja.
export default function AdminAiView({ user, onLogout, onOpenSettings, onOpenUsers }) {
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
    catch (e) { toast.error(t('ai2.excelError', { msg: e.message })) }
    finally { setExporting(false) }
  }
  const exportPdf = () => openReportPdf(`${q}&currency=${currency}`, setExporting, t)

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
        <Topbar user={user} onLogout={onLogout} onOpenSettings={onOpenSettings} onOpenUsers={onOpenUsers} />
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

              <Section collapseId="trend" title={t('ai2.section.dailyTrend')} hint={t('ai2.section.dailyTrendHint')}>
                <TrendChart days={(d.trends?.days || []).map(x => ({ date: x.date, requests: x.requests, cost: x.cost_usd }))} currency="USD" height={230} />
              </Section>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
                <Section collapseId="costByClient" title={t('ai2.section.costByClient')} hint={t('ai2.section.costByClientHint')}>
                  <PieChart data={clients.map(c => ({ label: c.name, value: c.cost_usd }))} valueFmt={v => fmtMoney(v)} centerValue={fmtMoney(tot?.total_cost_usd)} centerLabel={t('ai2.center.total')} />
                </Section>
                <Section collapseId="costBySource" title={t('ai2.section.costBySource')} hint={t('ai2.section.costBySourceHint')}>
                  <PieChart data={sources.map((s, i) => ({ label: s.source, value: s.cost_usd, color: colorAt(i + 2) }))} valueFmt={v => fmtMoney(v)} centerValue={`${sources.length}`} centerLabel={t('ai2.center.sources')} />
                </Section>
                <Section collapseId="costByModel" title={t('ai2.section.costByModel')}>
                  <PieChart data={models.map(m => ({ label: m.model, value: m.cost_usd }))} valueFmt={v => fmtMoney(v)} centerValue={`${models.length}`} centerLabel={t('ai2.center.models')} />
                </Section>
                <Section collapseId="tokensInOut" title={t('ai2.section.tokensInOut')}>
                  <PieChart
                    data={[
                      { label: t('ai2.label.promptInput'), value: tot?.prompt_tokens || 0, color: '#2563EB' },
                      { label: t('ai2.label.completionOutput'), value: tot?.completion_tokens || 0, color: '#7C3AED' },
                    ]}
                    valueFmt={fmtTok} centerValue={fmtTok(tot?.total_tokens)} centerLabel={t('ai2.center.tokens')} />
                </Section>
                <Section collapseId="requestsByClient" title={t('ai2.section.requestsByClient')} hint={t('ai2.top10')}>
                  <HBars data={clients.map(c => ({ label: c.name, value: c.requests }))} valueFmt={fmtNum} />
                </Section>
                <Section collapseId="costByApp" title={t('ai2.section.costByApp')} hint={d.byApp?.truncated ? t('ai2.hint.first40') : t('ai2.top10')}>
                  <HBars data={apps.map(a => ({ label: a.app, value: a.cost_usd }))} valueFmt={v => fmtMoney(v)} color="#0D9488" />
                </Section>
              </div>

              {gauges.length > 0 && (
                <Section collapseId="budgets" title={t('ai2.section.budgetsCurrentMonth')} hint={t('ai2.hint.spentVsLimit', { month: budgets?.month })}>
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
