import { useState, useEffect } from 'react'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { PieChart, fmtTok, fmtNum, fmtMoney } from '../../components/aiCharts.jsx'
import { toast } from '../../ui/Toast.jsx'
import { card, inputS, btnS, btnPrimary, presetRange, PRESETS, Section, Kpi, svcLabel, DateInput } from './ui.jsx'
import { SimpleTable } from './tables.jsx'

// Izveštaj po kupcu (PDF): izbor tenanta + perioda, pregled i klijentski PDF.
export default function ReportView({ range, preset, setPreset, setRange }) {
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
    catch (e) { toast.error(t('ai2.error', { msg: e.message })) }
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
      ${table(t('ai2.section.byApp'), head, rowsHtml((report.services || []).map(r => ({ ...r, name: svcLabel(t, r.service) })), cols))}
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
        <DateInput value={range.from} onChange={e => { setPreset(null); setRange(r => ({ ...r, from: e.target.value })) }} />
        <DateInput value={range.to} onChange={e => { setPreset(null); setRange(r => ({ ...r, to: e.target.value })) }} />
        <button onClick={load} disabled={!tenantGuid || busy} style={btnPrimary}>{busy ? t('ai2.loading') : t('ai2.load')}</button>
        {report && <button onClick={exportPdf} style={{ ...btnS, background: '#7C3AED', color: '#fff', border: 'none' }}>{t('ai2.exportPdf')}</button>}
      </div>

      {report && (
        <>
          {report.rate_available === false && (
            <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
              {t('ai2.report.rateUnavailable')}
            </div>
          )}
          {report.rate_stale && (
            <div style={{ ...card, borderColor: 'var(--amber)', color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }}>
              {t('ai2.rateStale', { n: report.rate_age_days })}
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
            <Section title={t('ai2.section.byApp')}><PieChart data={(report.services || []).map(s => ({ label: svcLabel(t, s.service), value: s.cost }))} valueFmt={v => fmtMoney(v, cur)} centerValue={`${(report.services || []).length}`} centerLabel={t('ai2.center.services')} /></Section>
          </div>
          <SimpleTable title={t('ai2.section.byModel')} rows={(report.models || []).map(m => ({ ...m, name: m.model }))} nameKey="name" cur={cur} />
          <SimpleTable title={t('ai2.section.bySource')} rows={(report.bySource || []).map(s => ({ ...s, name: s.source }))} nameKey="name" cur={cur} />
          <SimpleTable title={t('ai2.section.byApp')} rows={(report.services || []).map(s => ({ ...s, name: svcLabel(t, s.service) }))} nameKey="name" cur={cur} />
        </>
      )}
    </div>
  )
}
