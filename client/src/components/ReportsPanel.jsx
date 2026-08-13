import { useState, useCallback, useEffect } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'
import { toast } from '../ui/Toast.jsx'
import { useConfirm } from '../ui/Confirm.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Label from '../ui/Label.jsx'
import Card from '../ui/Card.jsx'
import { fmtDateLong } from '../utils/format.js'

// P3-2: admin ekran "Izveštaji" po projektu — rasporedi (kadenca/vreme/
// primaoci), istorija slanja sa statusom i preuzimanjem, "Pošalji odmah".

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"
const selectStyle = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 13 }

function ScheduleForm({ initial, onSave, onCancel, t }) {
  const [cadence, setCadence] = useState(initial?.cadence || 'weekly')
  const [dayOfWeek, setDayOfWeek] = useState(initial?.day_of_week ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(initial?.day_of_month ?? 1)
  const [hour, setHour] = useState(initial?.hour ?? 8)
  const [mode, setMode] = useState(initial?.recipients_mode || 'clients')
  const [emails, setEmails] = useState((initial?.recipients || []).join(', '))
  const [busy, setBusy] = useState(false)

  const DAYS = [t('day.mon'), t('day.tue'), t('day.wed'), t('day.thu'), t('day.fri'), t('day.sat'), t('day.sun')]

  async function save() {
    setBusy(true)
    try {
      await onSave({
        cadence, day_of_week: Number(dayOfWeek), day_of_month: Number(dayOfMonth), hour: Number(hour),
        recipients_mode: mode,
        recipients: emails.split(',').map(e => e.trim()).filter(Boolean),
      })
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Card style={{ padding: '16px 20px', marginBottom: 12, borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <Label>{t('rep.cadence')}</Label>
          <select value={cadence} onChange={e => setCadence(e.target.value)} style={selectStyle}>
            <option value="weekly">{t('rep.weekly')}</option>
            <option value="monthly">{t('rep.monthly')}</option>
          </select>
        </div>
        {cadence === 'weekly' ? (
          <div>
            <Label>{t('rep.day')}</Label>
            <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)} style={selectStyle}>
              {DAYS.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <Label>{t('rep.dayOfMonth')}</Label>
            <Input type="number" min={1} max={28} value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} style={{ width: 80 }} />
          </div>
        )}
        <div>
          <Label>{t('rep.hour')}</Label>
          <Input type="number" min={0} max={23} value={hour} onChange={e => setHour(e.target.value)} style={{ width: 80 }} />
        </div>
        <div>
          <Label>{t('rep.recipients')}</Label>
          <select value={mode} onChange={e => setMode(e.target.value)} style={selectStyle}>
            <option value="clients">{t('rep.mode.clients')}</option>
            <option value="internal">{t('rep.mode.internal')}</option>
            <option value="custom">{t('rep.mode.custom')}</option>
          </select>
        </div>
        {mode === 'custom' && (
          <div style={{ flex: '1 1 240px' }}>
            <Label>{t('rep.emails')}</Label>
            <Input value={emails} onChange={e => setEmails(e.target.value)} placeholder="ana@firma.com, marko@firma.com" style={{ width: '100%' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={save} disabled={busy}>{t('settings.jira.save')}</Button>
          <Button variant="ghost" onClick={onCancel}>{t('tabs.cancel')}</Button>
        </div>
      </div>
      <p style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)', margin: '10px 0 0' }}>{t('rep.timezoneNote')}</p>
    </Card>
  )
}

export default function ReportsPanel({ projectId }) {
  const t = useT()
  const confirm = useConfirm()
  const [schedules, setSchedules] = useState([])
  const [runs, setRuns] = useState([])
  const [editing, setEditing] = useState(null) // null | {} | schedule
  const [busyId, setBusyId] = useState(null)

  const reload = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.getReportSchedules(projectId), api.getReportRuns(projectId)])
      setSchedules(s?.schedules || [])
      setRuns(r?.runs || [])
    } catch (e) { toast.error(e.message) }
  }, [projectId])
  useEffect(() => { reload() }, [reload])

  const DAYS = [t('day.mon'), t('day.tue'), t('day.wed'), t('day.thu'), t('day.fri'), t('day.sat'), t('day.sun')]
  const scheduleLabel = s => s.cadence === 'monthly'
    ? t('rep.monthlyLabel', { day: s.day_of_month, hour: s.hour })
    : t('rep.weeklyLabel', { day: DAYS[(s.day_of_week || 1) - 1], hour: s.hour })
  const modeLabel = m => t(m === 'clients' ? 'rep.mode.clients' : m === 'internal' ? 'rep.mode.internal' : 'rep.mode.custom')

  async function handleSave(body) {
    if (editing?.id) await api.updateReportSchedule(editing.id, body)
    else await api.createReportSchedule(projectId, body)
    setEditing(null)
    await reload()
  }

  async function handleDelete(s) {
    if (!(await confirm(t('rep.deleteConfirm')))) return
    try { await api.deleteReportSchedule(s.id); await reload() } catch (e) { toast.error(e.message) }
  }

  async function handleRunNow(s) {
    setBusyId(s.id)
    try {
      const r = await api.runReportNow(s.id)
      if (r.status === 'ok') toast.success?.(t('rep.sentNow', { n: r.recipients ?? 0 }))
      else toast.error(r.error || t('rep.runFailed'))
      await reload()
    } catch (e) { toast.error(e.message) } finally { setBusyId(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: schedules.length || editing ? 12 : 0 }}>
          <div>
            <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{t('rep.title')}</div>
            <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginTop: 2 }}>{t('rep.subtitle')}</div>
          </div>
          {!editing && <Button variant="primary" onClick={() => setEditing({})}>{t('rep.new')}</Button>}
        </div>

        {editing && <ScheduleForm initial={editing.id ? editing : null} onSave={handleSave} onCancel={() => setEditing(null)} t={t} />}

        {schedules.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: font, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{scheduleLabel(s)}</span>
            <span style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)' }}>{modeLabel(s.recipients_mode)}{s.recipients?.length ? `: ${s.recipients.join(', ')}` : ''}</span>
            {!s.enabled && <span style={{ fontFamily: font, fontSize: 11, color: 'var(--amber)' }}>{t('rep.disabled')}</span>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <Button variant="pill" onClick={() => handleRunNow(s)} disabled={busyId === s.id}>{busyId === s.id ? t('app.loading') : t('rep.sendNow')}</Button>
              <Button variant="pill" onClick={() => setEditing(s)}>{t('qa2.admin.edit')}</Button>
              <Button variant="pill" style={{ color: 'var(--red)' }} onClick={() => handleDelete(s)}>{t('rn.delete')}</Button>
            </span>
          </div>
        ))}
        {!schedules.length && !editing && (
          <div style={{ fontFamily: font, fontSize: 13, color: 'var(--textMuted)', paddingTop: 10, borderTop: '1px solid var(--border)' }}>{t('rep.empty')}</div>
        )}
      </Card>

      <Card style={{ padding: '16px 20px' }}>
        <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 10 }}>{t('rep.history')}</div>
        {runs.length === 0 ? (
          <div style={{ fontFamily: font, fontSize: 13, color: 'var(--textMuted)' }}>{t('rep.historyEmpty')}</div>
        ) : runs.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: r.status === 'ok' ? 'var(--green)' : 'var(--red)' }} />
            <span style={{ fontFamily: font, fontSize: 13, color: 'var(--text)' }}>{fmtDateLong(r.ran_at)}</span>
            <span style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)' }}>
              {r.period || t('rep.manual')} · {modeLabel(r.audience)} · {t('rep.recipientsCount', { n: r.recipients_count })}
            </span>
            {r.error_message && <span style={{ fontFamily: font, fontSize: 12, color: 'var(--red)' }}>{r.error_message}</span>}
            {r.status === 'ok' && r.file_path && (
              <Button variant="pill" style={{ marginLeft: 'auto' }} onClick={() => api.downloadReportRun(r.id).catch(e => toast.error(e.message))}>
                {t('rep.download')}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
