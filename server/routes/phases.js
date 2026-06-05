import { Router } from 'express'
import db from '../db.js'

const router = Router()

function canAccessProject(userId, projectId) {
  const role = db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role || 'admin'
  if (role === 'admin' || role === 'super_admin') {
    return db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
  }
  return db.prepare(`
    SELECT p.id FROM project_clients pc
    JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ? AND p.id = ?
  `).get(userId, projectId)
}

function ownsProject(userId, projectId) {
  return db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
}

function ownsPhase(userId, phaseId) {
  return db.prepare(`
    SELECT ph.id FROM phases ph
    JOIN projects p ON p.id = ph.project_id
    WHERE ph.id = ? AND p.user_id = ?
  `).get(phaseId, userId)
}

// GET /api/phases/:projectId
router.get('/:projectId', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  if (!canAccessProject(req.userId, projectId)) return res.status(403).json({ error: 'Forbidden' })
  const phases = db.prepare(
    'SELECT id, name, color, position, due_date, created_at FROM phases WHERE project_id = ? ORDER BY position ASC, id ASC'
  ).all(projectId)

  const taskRows = db.prepare(
    'SELECT phase_id, task_key FROM phase_tasks WHERE project_id = ? ORDER BY position ASC'
  ).all(projectId)

  const phaseMap = {}
  for (const phase of phases) phaseMap[phase.id] = { ...phase, taskKeys: [] }
  for (const row of taskRows) {
    if (phaseMap[row.phase_id]) phaseMap[row.phase_id].taskKeys.push(row.task_key)
  }

  res.json({ phases: Object.values(phaseMap) })
})

// POST /api/phases/:projectId — create new phase
router.post('/:projectId', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  if (!ownsProject(req.userId, projectId)) return res.status(403).json({ error: 'Forbidden' })
  const { name, color = '#4F8EF7', dueDate } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name je obavezan' })

  const maxPos = db.prepare('SELECT MAX(position) as m FROM phases WHERE project_id = ?').get(projectId)?.m ?? -1
  const result = db.prepare(
    'INSERT INTO phases (project_id, name, color, position, due_date) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId, name.trim(), color, maxPos + 1, dueDate || null)

  const row = db.prepare('SELECT id, name, color, position, due_date, created_at FROM phases WHERE id = ?').get(result.lastInsertRowid)
  res.json({ phase: { ...row, taskKeys: [] } })
})

// PUT /api/phases/:phaseId — rename / recolor
router.put('/:phaseId', (req, res) => {
  const phaseId = parseInt(req.params.phaseId)
  if (!ownsPhase(req.userId, phaseId)) return res.status(403).json({ error: 'Forbidden' })
  const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(phaseId)
  if (!phase) return res.status(404).json({ error: 'Faza nije pronađena' })

  const { name, color, position, dueDate } = req.body
  db.prepare('UPDATE phases SET name = ?, color = ?, position = ?, due_date = ? WHERE id = ?')
    .run(name ?? phase.name, color ?? phase.color, position ?? phase.position, dueDate !== undefined ? (dueDate || null) : phase.due_date, phaseId)

  res.json({ ok: true })
})

// DELETE /api/phases/:phaseId — delete phase (tasks go to unassigned)
router.delete('/:phaseId', (req, res) => {
  const phaseId = parseInt(req.params.phaseId)
  if (!ownsPhase(req.userId, phaseId)) return res.status(403).json({ error: 'Forbidden' })
  db.prepare('DELETE FROM phases WHERE id = ?').run(phaseId)
  res.json({ ok: true })
})

// POST /api/phases/:projectId/assign — assign task to phase (phaseId null = unassigned)
router.post('/:projectId/assign', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  if (!ownsProject(req.userId, projectId)) return res.status(403).json({ error: 'Forbidden' })
  const { taskKey, phaseId } = req.body
  if (!taskKey) return res.status(400).json({ error: 'taskKey je obavezan' })

  if (phaseId === null || phaseId === undefined) {
    db.prepare('DELETE FROM phase_tasks WHERE project_id = ? AND task_key = ?').run(projectId, taskKey)
  } else {
    db.prepare('INSERT OR REPLACE INTO phase_tasks (phase_id, project_id, task_key) VALUES (?, ?, ?)')
      .run(phaseId, projectId, taskKey)
  }

  res.json({ ok: true })
})

// POST /api/phases/:projectId/reorder — reorder phases
router.post('/:projectId/reorder', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  if (!ownsProject(req.userId, projectId)) return res.status(403).json({ error: 'Forbidden' })
  const { phases } = req.body
  if (!Array.isArray(phases)) return res.status(400).json({ error: 'phases je obavezan array' })

  const update = db.prepare('UPDATE phases SET position = ? WHERE id = ?')
  db.transaction(() => { for (const { id, position } of phases) update.run(position, id) })()

  res.json({ ok: true })
})

export default router
