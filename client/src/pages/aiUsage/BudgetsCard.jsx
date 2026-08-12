import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { fmtMoney } from '../../components/aiCharts.jsx'
import { toast } from '../../ui/Toast.jsx'
import { inputS, btnS, thStyle, tdStyle, tdMono, Section } from './ui.jsx'

// Mesečni budžeti po tenantu: limit (ili paket), prag upozorenja, mail notifikacije.
export default function BudgetsCard() {
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
    } catch (err) { toast.error(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
  }
  const runCheck = async () => {
    setBusy(true)
    try {
      const r = await api.aiUsageCheckBudgets()
      toast.error(r.mail_configured
        ? t('ai2.budgets.checkResult', { n: r.results.filter(x => x.mail?.ok).length })
        : t('ai2.budgets.smtpNotConfigured'))
      await reload()
    } catch (e) { toast.error(t('ai2.error', { msg: e.message })) } finally { setBusy(false) }
  }

  return (
    <Section
      title={t('ai2.budgets.title')}
      hint={data ? t('ai2.budgets.hint', { month: data.month, smtp: data.mail_configured ? t('ai2.budgets.smtpOn') : t('ai2.budgets.smtpOff') }) : ''}
      right={<button onClick={runCheck} disabled={busy} style={btnS}>{t('ai2.budgets.checkNow')}</button>}
    >
      <div className="ui-scroll-x">
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
