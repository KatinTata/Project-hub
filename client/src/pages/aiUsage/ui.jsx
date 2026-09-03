import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { fmtMoney } from '../../components/aiCharts.jsx'
import { toast } from '../../ui/Toast.jsx'
import Button from '../../ui/Button.jsx'
import { useCollapsedSections, CollapseToggle } from '../../ui/collapse.jsx'

// ── shared styles / helpers ───────────────────────────────────────────────────

export const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }
export const label = { fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
export const big = { fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 23, color: 'var(--text)' }
export const sub = { fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 3 }
export const thStyle = { padding: '8px 12px', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--textMuted)', textAlign: 'left' }
export const tdStyle = { padding: '8px 12px', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, color: 'var(--text)', borderTop: '1px solid var(--border)' }
export const tdMono = { ...tdStyle, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12 }
export const inputS = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, boxSizing: 'border-box' }
export const btnS = { padding: '7px 16px', borderRadius: 8, fontSize: 13, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, border: '1px solid var(--borderHover)', background: 'var(--surfaceAlt)', color: 'var(--text)', cursor: 'pointer' }
export const btnPrimary = { ...btnS, background: 'var(--accent)', color: '#fff', border: 'none' }
const iso = d => d.toISOString().slice(0, 10)

export function presetRange(key) {
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
export const PRESETS = [['7d', 'ai2.preset.7d'], ['30d', 'ai2.preset.30d'], ['month', 'ai2.preset.month'], ['prevMonth', 'ai2.preset.prevMonth'], ['quarter', 'ai2.preset.quarter'], ['year', 'ai2.preset.year']]

// Date polje koje otvara kalendar na klik bilo gde u polju (native picker se
// inače otvara samo na ikonicu); showPicker traži korisnički gest i nije
// podržan svuda, pa try/catch — fallback je obično ponašanje polja.
export function DateInput({ value, onChange, style }) {
  const open = e => { try { e.currentTarget.showPicker?.() } catch { /* stariji browser */ } }
  return (
    <input type="date" value={value} onChange={onChange} onClick={open}
      style={{ ...inputS, width: 138, cursor: 'pointer', ...style }} />
  )
}

// Prijateljsko ime servisa: prevod pod ključem 'ai2.svc.<ime>' ako postoji,
// inače sirovo ime iz API-ja; null (red „Ostalo") ima svoj prevod.
export function svcLabel(t, service) {
  if (!service) return t('ai2.apps.other')
  const key = 'ai2.svc.' + service
  const v = t(key)
  return v === key ? service : v
}

export function AlertNotes({ alerts, onAck, compact }) {
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
              fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 9, padding: '1px 7px', borderRadius: 4, flexShrink: 0,
              background: a.level === 'limit' ? 'var(--red)' : 'var(--amber)', color: '#fff',
            }}>{a.level === 'limit' ? t('ai2.alerts.limit') : t('ai2.alerts.warning')}</span>
            <span style={{ flex: 1 }}>
              {!compact && <strong>{a.tenant_name}</strong>}{!compact && ' — '}
              {fmtMoney(a.spent_eur, 'EUR')} {t('ai2.of')} {fmtMoney(a.limit_eur, 'EUR')} ({Math.round(a.pct)}%) · {a.month}
              {a.mail_sent ? '' : ' · ' + t('ai2.alerts.mailNotSent')}
            </span>
            <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 10, color: 'var(--textMuted)' }}>{String(a.created_at).slice(0, 16)}</span>
            {onAck && <button onClick={() => onAck(a.id)} title={t('ai2.alerts.markRead')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.fg, fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

// `collapseId` (opciono, C5): sekcija dobija chevron i pamti sklopljenost.
export function Section({ title, hint, right, children, collapseId }) {
  const { collapsed, toggle } = useCollapsedSections('jt_ai_sections')
  const isCollapsed = !!collapseId && !!collapsed[collapseId]
  return (
    <div style={{ ...card, padding: 0, overflow: 'visible' }}>
      <div style={{ padding: '13px 18px', borderBottom: isCollapsed ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {collapseId && <CollapseToggle open={!isCollapsed} onClick={() => toggle(collapseId)} />}
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        {hint && <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>{hint}</span>}
        {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
      </div>
      {!isCollapsed && <div style={{ padding: 18 }}>{children}</div>}
    </div>
  )
}

export function Kpi({ title, value, subtitle, color }) {
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
export async function openReportPdf(q, setBusy, t) {
  const w = window.open('', '_blank')
  if (w) w.document.write(`<p style="font-family:sans-serif;padding:24px;color:#5A6480">${t('ai2.report.generating')}</p>`)
  setBusy?.(true)
  try {
    const html = await api.aiUsageReportHtml(q)
    if (w) { w.document.open(); w.document.write(html); w.document.close() }
  } catch (e) {
    w?.close()
    toast.error(t('ai2.report.pdfError', { msg: e.message }))
  } finally { setBusy?.(false) }
}

export function FilterBar({ preset, setPreset, range, setRange, onExport, onExportPdf, currency, setCurrency, exporting, loading }) {
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
      <DateInput value={range.from} onChange={e => { setPreset(null); setRange(r => ({ ...r, from: e.target.value })) }} />
      <DateInput value={range.to} onChange={e => { setPreset(null); setRange(r => ({ ...r, to: e.target.value })) }} />
      {setCurrency && (
        <select value={currency} onChange={e => setCurrency(e.target.value)} title={t('ai2.filter.currencyTitle')} style={{ ...inputS, width: 82 }}>
          {['USD', 'EUR', 'RSD'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <Button onClick={onExport} disabled={exporting} style={{ background: '#0D9488', color: '#fff', border: 'none' }}>
        {exporting ? t('ai2.filter.exporting') : t('ai2.filter.excelReport')}
      </Button>
      {onExportPdf && (
        <Button onClick={onExportPdf} disabled={exporting} style={{ background: '#7C3AED', color: '#fff', border: 'none' }}>
          {t('ai2.filter.pdfReport')}
        </Button>
      )}
      {loading && <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>{t('ai2.filter.loadingInline')}</span>}
    </div>
  )
}
