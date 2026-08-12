import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { toast } from '../../ui/Toast.jsx'
import { btnPrimary, thStyle, tdStyle, tdMono, Section } from './ui.jsx'

// Mapiranje tenanta na klijentske naloge + praćenje (is_tracked).
export default function MappingsCard() {
  const t = useT()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => setData(await api.aiUsageMappings()), [])
  useEffect(() => { reload() }, [reload])

  async function discover() {
    setBusy(true)
    try { await api.aiUsageDiscover(); await reload() }
    catch (e) { toast.error(t('ai2.error', { msg: e.message })) }
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
