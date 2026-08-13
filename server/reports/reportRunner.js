// P3-2: izvršavanje rasporeda izveštaja — određuje period, generiše HTML
// (klijentski i/ili interni profil), snima fajl, šalje mejl i beleži
// report_runs. Dedup: UNIQUE(schedule_id, period) — restart procesa ne šalje
// isti period dva puta; ručno slanje ima period = NULL (uvek prolazi).

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import db from '../db.js'
import { sendMail, mailConfigured } from '../aiUsage/mailer.js'
import { buildProgressReportData, renderProgressReportHtml } from './progressReport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data')
const reportsDir = path.join(dataDir, 'reports')

// Lokalni datum (ne UTC!) — toISOString bi lokalnu ponoć prebacio u juče.
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ISO nedelja (za period ključ 'YYYY-Wnn')
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Period za koji se izveštava = PRETHODNI zaokružen period (nedelja/mesec).
export function periodFor(schedule, now = new Date()) {
  if (schedule.cadence === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, start: isoDay(start), end: isoDay(end) }
  }
  // weekly: prethodnih 7 dana zaključno sa jučerašnjim danom
  const end = new Date(now.getTime() - 86400000)
  const start = new Date(end.getTime() - 6 * 86400000)
  return { key: isoWeek(end), start: isoDay(start), end: isoDay(end) }
}

function resolveRecipients(schedule) {
  if (schedule.recipients_mode === 'custom') {
    return db.prepare('SELECT email FROM report_recipients WHERE schedule_id = ?').all(schedule.id).map(r => r.email)
  }
  if (schedule.recipients_mode === 'internal') {
    const row = db.prepare('SELECT u.email FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(schedule.project_id)
    return row ? [row.email] : []
  }
  // 'clients'
  return db.prepare(`
    SELECT u.email FROM project_clients pc JOIN users u ON u.id = pc.client_user_id
    WHERE pc.project_id = ?
  `).all(schedule.project_id).map(r => r.email)
}

// Izvrši jedan raspored za dati period; periodKey = null → ručno slanje.
export async function runReportSchedule(schedule, { period = null, manual = false } = {}) {
  const now = new Date()
  const p = period || periodFor(schedule, now)
  const periodKey = manual ? null : p.key

  // Dedup rezervacija: upiši run PRE slanja; UNIQUE(schedule_id, period)
  // obara duplikat pa restart usred slanja ne šalje ponovo.
  let runId
  try {
    runId = db.prepare(`
      INSERT INTO report_runs (schedule_id, project_id, period, status, audience)
      VALUES (?, ?, ?, 'error', ?)
    `).run(schedule.id, schedule.project_id, periodKey, schedule.recipients_mode).lastInsertRowid
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return { skipped: true, reason: 'već poslat za period' }
    throw e
  }

  const finish = (status, patch = {}) => {
    db.prepare(`
      UPDATE report_runs SET status = ?, file_path = ?, recipients_count = ?, error_message = ? WHERE id = ?
    `).run(status, patch.filePath || null, patch.recipients || 0, patch.error || null, runId)
    return { runId, status, ...patch }
  }

  try {
    const profile = schedule.recipients_mode === 'internal' ? 'internal' : 'client'
    const data = buildProgressReportData(schedule.project_id, { periodStart: p.start, periodEnd: p.end, profile })
    if (!data) return finish('error', { error: 'Projekat ne postoji' })

    const html = renderProgressReportHtml(data)
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
    const fileName = `report-${schedule.project_id}-${(periodKey || `manual-${runId}`)}.html`.replace(/[^\w.-]/g, '_')
    fs.writeFileSync(path.join(reportsDir, fileName), html, 'utf-8')

    const recipients = resolveRecipients(schedule)
    let sent = 0
    if (recipients.length && mailConfigured()) {
      const subject = `Izveštaj o napretku — ${data.project.name} (${p.start} do ${p.end})`
      const r = await sendMail({ to: recipients, subject, html })
      if (!r.ok && !r.skipped) return finish('error', { filePath: fileName, recipients: 0, error: `Mail: ${r.error}` })
      sent = r.ok ? recipients.length : 0
    }
    return finish('ok', { filePath: fileName, recipients: sent })
  } catch (e) {
    return finish('error', { error: e.message })
  }
}

// Scheduler kuka: pokreni sve rasporede koji su "dospeli" (dan + sat prošao,
// nadoknada u okviru istog dana) i još nemaju run za tekući period.
export async function runDueReportSchedules(belgrade) {
  const schedules = db.prepare('SELECT * FROM report_schedules WHERE enabled = 1').all()
  const results = []
  for (const s of schedules) {
    const due = s.cadence === 'monthly'
      ? belgrade.dayOfMonth === (s.day_of_month || 1)
      : belgrade.isoWeekday === (s.day_of_week || 1)
    if (!due) continue
    if (belgrade.hour < (s.hour ?? 8)) continue
    const r = await runReportSchedule(s)
    if (!r.skipped) results.push({ scheduleId: s.id, projectId: s.project_id, ...r })
  }
  return results
}

export function reportsFileDir() { return reportsDir }
