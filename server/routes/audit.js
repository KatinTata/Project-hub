import { Router } from 'express'
import db from '../db.js'

const router = Router()

function requireSuperAdmin(req, res, next) {
  const role = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId)?.role
  if (role !== 'super_admin') return res.status(403).json({ error: 'Forbidden: super admin only' })
  next()
}

// GET /api/audit?limit=200 — most recent audit entries (super_admin only)
router.get('/', requireSuperAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000)
  const rows = db.prepare(`
    SELECT a.id, a.user_id, a.action, a.detail, a.ip, a.created_at,
           u.name as user_name, u.email as user_email
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
    LIMIT ?
  `).all(limit)
  res.json({ entries: rows })
})

export default router
