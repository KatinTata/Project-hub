import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import Topbar from '../../components/Topbar.jsx'
import BrainAnimation from '../../components/BrainAnimation.jsx'
import { PieChart, HBars, TrendChart, BudgetGauge, fmtTok, fmtNum, fmtMoney } from '../../components/aiCharts.jsx'
import { toast } from '../../ui/Toast.jsx'
import { card, presetRange, AlertNotes, Section, Kpi, FilterBar, openReportPdf } from './ui.jsx'
import { SimpleTable } from './tables.jsx'

// Klijentski pogled: sopstvena potrošnja (preko client_tenant_users), paket/budžet.
export default function ClientAiView({ user, onLogout, onOpenSettings, onOpenUsers }) {
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
    catch (e) { toast.error(t('ai2.excelError', { msg: e.message })) }
    finally { setExporting(false) }
  }
  const exportPdf = () => openReportPdf(`from=${range.from}&to=${range.to}&currency=${currency}`, setExporting, t)

  const cur = data?.currency || currency
  const apps = data?.byApp || []
  const models = data?.models || []
  const tot = data?.totals

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}><BrainAnimation opacity={0.4} fullscreen /></div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Topbar user={user} onLogout={onLogout} onOpenSettings={onOpenSettings} onOpenUsers={onOpenUsers} />
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
              {data?.rate_stale && (
                <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
                  {t('ai2.rateStale', { n: data.rate_age_days })}
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
