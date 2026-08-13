// P3-3: rute za proaktivna upozorenja.
//  - /my            → in-app upozorenja ulogovanog korisnika (kroz alert_deliveries)
//  - /my/read-all   → označi sve kao pročitano
//  - /:projectId/rules (GET/PUT) → efektivna pravila po projektu (vlasnik)
//  - /:projectId/history          → istorija alarma sa ack (vlasnik)
//  - /:id/ack                     → potvrda alarma (vlasnik projekta)
import { Router } from 'express'
import db from '../db.js'
import { getRole, isAdminRole } from '../rbac.js'
import { logAudit } from '../audit.js'
import { effectiveRule, ALERT_TYPES } from '../alerts/detector.js'

const router = Router()

function ownedProject(userId, projectId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
}

router.get('/my', (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.project_id, a.type, a.severity, a.title, a.body, a.created_at,
           d.id AS delivery_id, d.read_at,
           COALESCE(p.display_name, p.epic_key) AS project_name
    FROM alert_deliveries d
    JOIN alerts a ON a.id = d.alert_id
    LEFT JOIN projects p ON p.id = a.project_id
    WHERE d.user_id = ? AND d.channel = 'in_app'
    ORDER BY a.created_at DESC LIMIT 30
  `).all(req.userId)
  const unread = rows.filter(r => !r.read_at).length
  res.json({ alerts: rows, unread })
})

router.put('/my/read-all', (req, res) => {
  db.prepare('UPDATE alert_deliveries SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL').run(req.userId)
  res.json({ ok: true })
})

router.get('/:projectId/rules', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  if (!ownedProject(req.userId, req.params.projectId)) return res.status(403).json({ error: 'Forbidden' })
  const rules = ALERT_TYPES.map(type => {
    const r = effectiveRule(Number(req.params.projectId), type)
    return {
      type,
      enabled: !!r?.enabled,
      threshold: r?.threshold ?? null,
      channel: r?.channel || 'in_app',
      audience: r?.audience || 'internal',
      source: r?.id ? r.scope : 'default', // 'project' | 'global' | 'default'
    }
  })
  res.json({ rules })
})

router.put('/:projectId/rules', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  if (!ownedProject(req.userId, req.params.projectId)) return res.status(403).json({ error: 'Forbidden' })
  const rules = Array.isArray(req.body?.rules) ? req.body.rules : []
  const upsert = db.prepare(`
    INSERT INTO alert_rules (scope, project_id, type, threshold, channel, audience, enabled, created_by)
    VALUES ('project', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope, project_id, type) DO UPDATE SET
      threshold = excluded.threshold, channel = excluded.channel,
      audience = excluded.audience, enabled = excluded.enabled
  `)
  for (const r of rules) {
    if (!ALERT_TYPES.includes(r.type)) continue
    const channel = ['in_app', 'email', 'both'].includes(r.channel) ? r.channel : 'in_app'
    const audience = ['internal', 'client', 'both'].includes(r.audience) ? r.audience : 'internal'
    const threshold = r.threshold == null || r.threshold === '' ? null : Number(r.threshold)
    upsert.run(req.params.projectId, r.type, Number.isFinite(threshold) ? threshold : null, channel, audience, r.enabled ? 1 : 0, req.userId)
  }
  logAudit(req.userId, 'alert.rules.update', `projekat ${req.params.projectId}`, req)
  res.json({ ok: true })
})

router.get('/:projectId/history', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  if (!ownedProject(req.userId, req.params.projectId)) return res.status(403).json({ error: 'Forbidden' })
  const alerts = db.prepare(`
    SELECT a.*, u.name AS acknowledged_by_name
    FROM alerts a LEFT JOIN users u ON u.id = a.acknowledged_by
    WHERE a.project_id = ? ORDER BY a.created_at DESC LIMIT 50
  `).all(req.params.projectId)
  res.json({ alerts })
})

router.post('/:id/ack', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const alert = db.prepare(`
    SELECT a.id FROM alerts a JOIN projects p ON p.id = a.project_id
    WHERE a.id = ? AND p.user_id = ?
  `).get(req.params.id, req.userId)
  if (!alert) return res.status(404).json({ error: 'Upozorenje nije pronađeno' })
  db.prepare('UPDATE alerts SET acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.userId, alert.id)
  res.json({ ok: true })
})

export default router
