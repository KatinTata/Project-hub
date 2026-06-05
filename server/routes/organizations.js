import { Router } from 'express'
import db from '../db.js'

const router = Router()

function requireSuperAdmin(req, res, next) {
  const role = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId)?.role
  if (role !== 'super_admin') return res.status(403).json({ error: 'Forbidden: super admin only' })
  next()
}

// GET /api/organizations — list all (any authenticated user can read)
router.get('/', (req, res) => {
  const orgs = db.prepare('SELECT id, name, created_at as createdAt FROM organizations ORDER BY name ASC').all()
  res.json(orgs)
})

// POST /api/organizations — create
router.post('/', requireSuperAdmin, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Naziv je obavezan' })
  try {
    const result = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(name.trim())
    const org = db.prepare('SELECT id, name, created_at as createdAt FROM organizations WHERE id = ?').get(result.lastInsertRowid)
    res.json({ org })
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Organizacija sa tim nazivom već postoji' })
    res.status(500).json({ error: 'Greška servera' })
  }
})

// PUT /api/organizations/:id — rename
router.put('/:id', requireSuperAdmin, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Naziv je obavezan' })
  try {
    const info = db.prepare('UPDATE organizations SET name = ? WHERE id = ?').run(name.trim(), req.params.id)
    if (info.changes === 0) return res.status(404).json({ error: 'Organizacija nije pronađena' })
    const org = db.prepare('SELECT id, name, created_at as createdAt FROM organizations WHERE id = ?').get(req.params.id)
    res.json({ org })
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Organizacija sa tim nazivom već postoji' })
    res.status(500).json({ error: 'Greška servera' })
  }
})

// DELETE /api/organizations/:id
router.delete('/:id', requireSuperAdmin, (req, res) => {
  db.prepare('DELETE FROM organizations WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
