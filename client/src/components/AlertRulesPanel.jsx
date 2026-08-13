import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'
import { toast } from '../ui/Toast.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Card from '../ui/Card.jsx'
import { fmtDateLong } from '../utils/format.js'

// P3-3: pravila upozorenja po projektu (tip, prag, kanal, publika) + istorija
// alarma sa potvrdom (ack). Podrazumevane vrednosti važe dok se ne sačuva.

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"
const selectStyle = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 12 }

const SEVERITY_COLOR = { critical: 'var(--red)', warning: 'var(--amber)', info: 'var(--accent)' }

export default function AlertRulesPanel({ projectId }) {
  const t = useT()
  const [rules, setRules] = useState([])
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [r, h] = await Promise.all([api.getAlertRules(projectId), api.getAlertHistory(projectId)])
      setRules(r?.rules || [])
      setHistory(h?.alerts || [])
      setDirty(false)
    } catch (e) { toast.error(e.message) }
  }, [projectId])
  useEffect(() => { reload() }, [reload])

  const TYPE_LABEL = {
    overrun: t('alerts.type.overrun'),
    phase_delay: t('alerts.type.phaseDelay'),
    no_activity: t('alerts.type.noActivity'),
    new_release: t('alerts.type.newRelease'),
  }
  const THRESHOLD_HINT = { overrun: '%', no_activity: t('alerts.days') }

  function setRule(type, key, value) {
    setRules(prev => prev.map(r => r.type === type ? { ...r, [key]: value } : r))
    setDirty(true)
  }

  async function save() {
    setBusy(true)
    try {
      await api.saveAlertRules(projectId, rules)
      await reload()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  async function ack(alert) {
    try { await api.ackProjectAlert(alert.id); await reload() } catch (e) { toast.error(e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{t('alerts.rulesTitle')}</div>
            <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginTop: 2 }}>{t('alerts.rulesSubtitle')}</div>
          </div>
          {dirty && <Button variant="primary" onClick={save} disabled={busy}>{busy ? t('app.loading') : t('settings.jira.save')}</Button>}
        </div>

        {rules.map(r => (
          <div key={r.type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: font, fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 220, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!r.enabled} onChange={e => setRule(r.type, 'enabled', e.target.checked)} />
              {TYPE_LABEL[r.type] || r.type}
            </label>
            {(r.type === 'overrun' || r.type === 'no_activity') && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: font, fontSize: 12, color: 'var(--textMuted)' }}>
                {t('alerts.threshold')}
                <Input type="number" value={r.threshold ?? ''} placeholder={r.type === 'overrun' ? '15' : '7'}
                  onChange={e => setRule(r.type, 'threshold', e.target.value)} style={{ width: 70, padding: '5px 8px', fontSize: 12 }} />
                {THRESHOLD_HINT[r.type]}
              </label>
            )}
            <select value={r.channel} onChange={e => setRule(r.type, 'channel', e.target.value)} style={selectStyle}>
              <option value="in_app">{t('alerts.channel.inApp')}</option>
              <option value="email">{t('alerts.channel.email')}</option>
              <option value="both">{t('alerts.channel.both')}</option>
            </select>
            <select value={r.audience} onChange={e => setRule(r.type, 'audience', e.target.value)} style={selectStyle}>
              <option value="internal">{t('alerts.audience.internal')}</option>
              <option value="client">{t('alerts.audience.client')}</option>
              <option value="both">{t('alerts.audience.both')}</option>
            </select>
            {r.source === 'default' && <span style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)' }}>{t('alerts.defaultRule')}</span>}
          </div>
        ))}
        <p style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)', margin: '10px 0 0' }}>{t('alerts.note')}</p>
      </Card>

      <Card style={{ padding: '16px 20px' }}>
        <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 10 }}>{t('alerts.historyTitle')}</div>
        {history.length === 0 ? (
          <div style={{ fontFamily: font, fontSize: 13, color: 'var(--textMuted)' }}>{t('alerts.historyEmpty')}</div>
        ) : history.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: SEVERITY_COLOR[a.severity] || 'var(--textMuted)' }} />
            <span style={{ fontFamily: font, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{a.title}</span>
            <span style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)' }}>{fmtDateLong(a.created_at)}</span>
            {a.acknowledged_at ? (
              <span style={{ fontFamily: font, fontSize: 11, color: 'var(--green)', marginLeft: 'auto' }}>
                {t('alerts.acked', { name: a.acknowledged_by_name || '' })}
              </span>
            ) : (
              <Button variant="pill" style={{ marginLeft: 'auto' }} onClick={() => ack(a)}>{t('alerts.ack')}</Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
