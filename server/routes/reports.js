import { Router } from 'express'
import db from '../db.js'
import { buildProjectReport } from '../excel/buildReport.js'
import { getRole, isAdminRole } from '../rbac.js'

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

export default router
