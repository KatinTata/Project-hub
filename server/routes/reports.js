import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import db from '../db.js'
import { buildProjectReport } from '../excel/buildReport.js'
import { getRole, isAdminRole } from '../rbac.js'
import { logAudit } from '../audit.js'
import { runReportSchedule, reportsFileDir } from '../reports/reportRunner.js'

const router = Router()

function getAccessibleProject(userId, projectId, role) {
  if (isAdminRole(role)) {
    return db.prepare('SELECT id, epic_key as epicKey, display_name as displayName FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
  }
  return db.prepare(`
    SELECT p.id, p.epic_key as epicKey, p.display_name as displayName
    FROM project_clients pc JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ? AND p.id = ?
  `).get(userId, projectId)
}

// POST /api/reports/:projectId/excel — generate the .xlsx report from the
// client-computed dashboard payload.
router.post('/:projectId/excel', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId)
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Nevalidan projekat' })

    const role = getRole(req.userId)
    const project = getAccessibleProject(req.userId, projectId, role)
    if (!project) return res.status(403).json({ error: 'Nemate pristup ovom projektu' })

    const payload = req.body || {}
    const userRow = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId)
    // Trust server-side project identity; client only supplies the numbers.
    payload.meta = {
      ...(payload.meta || {}),
      projectName: project.displayName || project.epicKey,
      epicKey: project.epicKey,
      generatedBy: payload.meta?.generatedBy || userRow?.name || null,
      generatedAt: new Date().toISOString(),
    }

    const buffer = await buildProjectReport(payload)

    const safe = (project.displayName || project.epicKey || 'projekat')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'projekat'
    const filename = `report-${safe}-${new Date().toISOString().slice(0, 10)}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('reports/excel error:', err)
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

// ── Automatski izveštaji (P3-2) ──────────────────────────────────────────────
// Rasporede vidi/menja samo vlasnik projekta (admin); klijent ima listu i
// preuzimanje SAMO izveštaja namenjenih klijentima za svoje projekte.

function ownedProject(userId, projectId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
}

const SCHEDULE_FIELDS = `id, project_id, cadence, day_of_week, day_of_month, hour, timezone,
  format, recipients_mode, enabled, created_at`

router.get('/:projectId/schedules', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  if (!ownedProject(req.userId, req.params.projectId)) return res.status(403).json({ error: 'Forbidden' })
  const schedules = db.prepare(`SELECT ${SCHEDULE_FIELDS} FROM report_schedules WHERE project_id = ? ORDER BY id`).all(req.params.projectId)
  for (const s of schedules) {
    s.recipients = s.recipients_mode === 'custom'
      ? db.prepare('SELECT email FROM report_recipients WHERE schedule_id = ?').all(s.id).map(r => r.email)
      : []
  }
  res.json({ schedules })
})

function validateSchedule(body) {
  const cadence = ['weekly', 'monthly'].includes(body.cadence) ? body.cadence : 'weekly'
  const recipientsMode = ['clients', 'internal', 'custom'].includes(body.recipients_mode) ? body.recipients_mode : 'clients'
  const dayOfWeek = Math.min(7, Math.max(1, parseInt(body.day_of_week, 10) || 1))
  const dayOfMonth = Math.min(28, Math.max(1, parseInt(body.day_of_month, 10) || 1))
  const hour = Math.min(23, Math.max(0, parseInt(body.hour, 10) || 8))
  const emails = Array.isArray(body.recipients)
    ? body.recipients.map(e => String(e).trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    : []
  return { cadence, recipientsMode, dayOfWeek, dayOfMonth, hour, emails, enabled: body.enabled === false ? 0 : 1 }
}

router.post('/:projectId/schedules', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  if (!ownedProject(req.userId, req.params.projectId)) return res.status(403).json({ error: 'Forbidden' })
  const v = validateSchedule(req.body || {})
  if (v.recipientsMode === 'custom' && v.emails.length === 0) {
    return res.status(400).json({ error: 'Za custom primaoce navedi bar jednu email adresu' })
  }
  const r = db.prepare(`
    INSERT INTO report_schedules (project_id, cadence, day_of_week, day_of_month, hour, recipients_mode, enabled, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.projectId, v.cadence, v.dayOfWeek, v.dayOfMonth, v.hour, v.recipientsMode, v.enabled, req.userId)
  for (const email of v.emails) {
    db.prepare('INSERT INTO report_recipients (schedule_id, email) VALUES (?, ?)').run(r.lastInsertRowid, email)
  }
  logAudit(req.userId, 'report.schedule.create', `raspored ${r.lastInsertRowid} (projekat ${req.params.projectId}, ${v.cadence})`, req)
  res.json({ id: r.lastInsertRowid })
})

function ownedSchedule(userId, scheduleId) {
  return db.prepare(`
    SELECT s.* FROM report_schedules s JOIN projects p ON p.id = s.project_id
    WHERE s.id = ? AND p.user_id = ?
  `).get(scheduleId, userId)
}

router.put('/schedules/:id', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const schedule = ownedSchedule(req.userId, req.params.id)
  if (!schedule) return res.status(404).json({ error: 'Raspored nije pronađen' })
  const v = validateSchedule(req.body || {})
  db.prepare(`
    UPDATE report_schedules SET cadence = ?, day_of_week = ?, day_of_month = ?, hour = ?, recipients_mode = ?, enabled = ?
    WHERE id = ?
  `).run(v.cadence, v.dayOfWeek, v.dayOfMonth, v.hour, v.recipientsMode, v.enabled, schedule.id)
  db.prepare('DELETE FROM report_recipients WHERE schedule_id = ?').run(schedule.id)
  for (const email of v.emails) {
    db.prepare('INSERT INTO report_recipients (schedule_id, email) VALUES (?, ?)').run(schedule.id, email)
  }
  logAudit(req.userId, 'report.schedule.update', `raspored ${schedule.id}`, req)
  res.json({ ok: true })
})

router.delete('/schedules/:id', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const schedule = ownedSchedule(req.userId, req.params.id)
  if (!schedule) return res.status(404).json({ error: 'Raspored nije pronađen' })
  db.prepare('DELETE FROM report_schedules WHERE id = ?').run(schedule.id)
  logAudit(req.userId, 'report.schedule.delete', `raspored ${schedule.id}`, req)
  res.json({ ok: true })
})

router.post('/schedules/:id/run-now', async (req, res) => {
  try {
    if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
    const schedule = ownedSchedule(req.userId, req.params.id)
    if (!schedule) return res.status(404).json({ error: 'Raspored nije pronađen' })
    const r = await runReportSchedule(schedule, { manual: true })
    logAudit(req.userId, 'report.run.manual', `raspored ${schedule.id} → ${r.status}`, req)
    res.json(r)
  } catch (err) {
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

// Klijent: lista izveštaja poslatih klijentima za njegove projekte.
// VAŽNO: definisano PRE /:projectId/runs da 'my' ne upadne u param rutu.
router.get('/my/runs', (req, res) => {
  const runs = db.prepare(`
    SELECT r.id, r.project_id, r.period, r.ran_at, r.file_path,
           p.display_name AS project_name, p.epic_key
    FROM report_runs r
    JOIN projects p ON p.id = r.project_id
    JOIN project_clients pc ON pc.project_id = r.project_id
    WHERE pc.client_user_id = ? AND r.status = 'ok' AND r.audience = 'clients' AND r.file_path IS NOT NULL
    ORDER BY r.ran_at DESC LIMIT 50
  `).all(req.userId)
  res.json({ runs })
})

router.get('/:projectId/runs', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  if (!ownedProject(req.userId, req.params.projectId)) return res.status(403).json({ error: 'Forbidden' })
  const runs = db.prepare(`
    SELECT id, schedule_id, period, ran_at, status, file_path, recipients_count, audience, error_message
    FROM report_runs WHERE project_id = ? ORDER BY ran_at DESC LIMIT 50
  `).all(req.params.projectId)
  res.json({ runs })
})

router.get('/runs/:id/download', (req, res) => {
  const run = db.prepare('SELECT * FROM report_runs WHERE id = ?').get(req.params.id)
  if (!run || !run.file_path) return res.status(404).json({ error: 'Izveštaj nije pronađen' })
  const role = getRole(req.userId)
  if (isAdminRole(role)) {
    if (!ownedProject(req.userId, run.project_id)) return res.status(403).json({ error: 'Forbidden' })
  } else {
    // Klijent: samo klijentski izveštaji za projekte na koje je dodeljen
    const linked = db.prepare('SELECT 1 FROM project_clients WHERE client_user_id = ? AND project_id = ?').get(req.userId, run.project_id)
    if (!linked || run.audience !== 'clients') return res.status(403).json({ error: 'Forbidden' })
  }
  const fullPath = path.join(reportsFileDir(), path.basename(run.file_path))
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Fajl nije pronađen' })
  logAudit(req.userId, 'report.download', `izveštaj ${run.id}`, req)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="izvestaj-${run.project_id}-${run.period || run.id}.html"`)
  fs.createReadStream(fullPath).pipe(res)
})

export default router
