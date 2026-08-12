import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { fmtMoney } from '../../components/aiCharts.jsx'
import { toast } from '../../ui/Toast.jsx'
import { useConfirm } from '../../ui/Confirm.jsx'
import { inputS, btnS, btnPrimary, thStyle, tdStyle, tdMono, Section } from './ui.jsx'

// AI paketi (tieri): fiksni pristup + uključena potrošnja
export default function PackagesCard() {
  const t = useT()
  const confirmDialog = useConfirm()
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
    } catch (err) { toast.error(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
  }
  const createPkg = async () => {
    if (!draft?.name?.trim()) { toast.error(t('ai2.packages.enterName')); return }
    setBusy(true)
    try { await api.aiUsageCreatePackage(draft); setDraft(null); await reload() }
    catch (err) { toast.error(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
  }
  const removePkg = async (id, name) => {
    if (!(await confirmDialog(t('ai2.packages.deleteConfirm', { name })))) return
    setBusy(true)
    try { await api.aiUsageDeletePackage(id); await reload() }
    catch (err) { toast.error(t('ai2.error', { msg: err.message })) } finally { setBusy(false) }
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
