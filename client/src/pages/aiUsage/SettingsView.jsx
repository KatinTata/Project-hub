import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { toast } from '../../ui/Toast.jsx'
import { inputS, btnS, btnPrimary, thStyle, tdStyle, tdMono, Section, DateInput } from './ui.jsx'
import MappingsCard from './MappingsCard.jsx'
import PackagesCard from './PackagesCard.jsx'
import BudgetsCard from './BudgetsCard.jsx'

// Podešavanja (super_admin): API konekcija, cenovnik modela sa markup-om,
// istorija cena + kartice za mapiranja, pakete i budžete.
export default function SettingsView() {
  const t = useT()
  const [cfg, setCfg] = useState(null)
  const [models, setModels] = useState(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [globalMarkup, setGlobalMarkup] = useState('')
  const [toolPrice, setToolPrice] = useState('')
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
    setToolPrice(String(c.pricing?.tool_price_per_request ?? 0))
  }, [])
  useEffect(() => { reload() }, [reload])

  const wrap = fn => async (...a) => { setBusy(true); try { await fn(...a); await reload() } catch (e) { toast.error(t('ai2.error', { msg: e.message })) } finally { setBusy(false) } }
  const saveConfig = wrap(async () => { await api.aiUsageSaveConfig({ base_url: baseUrl.trim(), is_active: true, service_password: keyInput || undefined }); setKeyInput('') })
  const saveMarkup = wrap(() => api.aiUsageSavePricingConfig({ global_markup_pct: Number(globalMarkup), tool_price_per_request: Number(toolPrice) || 0 }))
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
          <div style={{ marginTop: 8, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: (testMsg ? testMsg.ok : cfg.last_test_ok) ? 'var(--green)' : 'var(--red)' }}>
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
            <label title={t('ai2.settings.toolPriceTitle')} style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t('ai2.settings.toolPrice')}
              <input value={toolPrice} onChange={e => setToolPrice(e.target.value)} type="number" step="0.0001" min="0" style={{ ...inputS, width: 92 }} />
            </label>
            <button onClick={saveMarkup} disabled={busy} style={btnS}>{t('ai2.settings.saveMarkup')}</button>
            <button onClick={fetchFx} disabled={busy} style={btnS}>{t('ai2.settings.fetchRates')}</button>
            <button onClick={runSync} disabled={busy} style={btnPrimary}>{busy ? t('ai2.settings.working') : t('ai2.settings.syncAzure')}</button>
          </span>
        }
      >
        <div className="ui-scroll-x">
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
              <div key={h.id} style={{ display: 'flex', gap: 10, padding: '4px 0', borderTop: '1px solid var(--border)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', flexWrap: 'wrap' }}>
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
      <ProbeCard />
    </div>
  )
}

// Sirovi pozivi Agentic Admin API-ja (samo super_admin) — dijagnostika: šta
// tačno vraća API za dati alat/period, npr. akcije koje ne upisuju model.
const PROBE_PATHS = [
  '/api/admin/usage/ai/summary',
  '/api/admin/usage/ai/actions',
  '/api/admin/usage/ai/service-names',
  '/api/admin/usage/ai/models',
  '/api/admin/tenants',
]
const GROUP_BYS = ['Model', 'None', 'Tenant', 'ModelTenant', 'ModelDay']

function ProbeCard() {
  const t = useT()
  const iso = d => d.toISOString().slice(0, 10)
  const [form, setForm] = useState({
    path: PROBE_PATHS[0],
    from: iso(new Date(Date.now() - 30 * 86400000)),
    to: iso(new Date()),
    groupBy: 'Model', action: '', tenantId: '',
  })
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isSummary = form.path.endsWith('/summary')

  async function run() {
    setBusy(true)
    try {
      const q = new URLSearchParams({ path: form.path })
      if (isSummary) {
        q.set('from', form.from); q.set('to', form.to); q.set('groupBy', form.groupBy)
        if (form.action.trim()) q.set('action', form.action.trim())
        if (form.tenantId.trim()) q.set('tenantId', form.tenantId.trim())
      }
      setOut(await api.aiUsageProbe(q.toString()))
    } catch (e) { setOut({ error: e.message }) } finally { setBusy(false) }
  }

  return (
    <Section title={t('ai2.probe.title')} hint={t('ai2.probe.hint')}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={form.path} onChange={e => set('path', e.target.value)} style={{ ...inputS, minWidth: 280 }}>
          {PROBE_PATHS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {isSummary && (
          <>
            <DateInput value={form.from} onChange={e => set('from', e.target.value)} />
            <DateInput value={form.to} onChange={e => set('to', e.target.value)} />
            <select value={form.groupBy} onChange={e => set('groupBy', e.target.value)} title="groupBy" style={{ ...inputS, width: 130 }}>
              {GROUP_BYS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input value={form.action} onChange={e => set('action', e.target.value)} placeholder={t('ai2.probe.actionPh')} style={{ ...inputS, flex: '1 1 230px' }} />
            <input value={form.tenantId} onChange={e => set('tenantId', e.target.value)} placeholder={t('ai2.probe.tenantPh')} style={{ ...inputS, flex: '1 1 230px' }} />
          </>
        )}
        <button onClick={run} disabled={busy} style={btnPrimary}>{busy ? t('ai2.loading') : t('ai2.probe.run')}</button>
      </div>
      {out && (
        <pre style={{
          marginTop: 12, maxHeight: 420, overflow: 'auto', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 12, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{JSON.stringify(out, null, 2)}</pre>
      )}
    </Section>
  )
}
