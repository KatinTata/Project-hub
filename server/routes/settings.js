import { Router } from 'express'
import db from '../db.js'

const router = Router()

const DEFAULTS = { workdayHours: 6.5, workdaysPerWeek: 5 }

function getRole(userId) {
  return db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role || 'user'
}

function readSettings() {
  const rows = db.prepare('SELECT key, value FROM app_settings').all()
  const map = {}
  for (const r of rows) map[r.key] = r.value
  const num = (k, d) => {
    const v = parseFloat(map[k])
    return Number.isFinite(v) ? v : d
  }
  return {
    workdayHours: num('workdayHours', DEFAULTS.workdayHours),
    workdaysPerWeek: num('workdaysPerWeek', DEFAULTS.workdaysPerWeek),
  }
}

// GET /api/settings — any authenticated user (planning config is read widely)
router.get('/', (req, res) => {
  res.json(readSettings())
})

// PUT /api/settings — super_admin only (global planning assumptions)
router.put('/', (req, res) => {
  if (getRole(req.userId) !== 'super_admin') return res.status(403).json({ error: 'Samo super admin' })
  const { workdayHours, workdaysPerWeek } = req.body
  const set = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

  if (workdayHours !== undefined) {
    const h = parseFloat(workdayHours)
    if (!(h > 0 && h <= 24)) return res.status(400).json({ error: 'Sati po danu moraju biti između 0 i 24' })
    set.run('workdayHours', String(h))
  }
  if (workdaysPerWeek !== undefined) {
    const d = parseInt(workdaysPerWeek, 10)
    if (!(d >= 1 && d <= 7)) return res.status(400).json({ error: 'Radnih dana u nedelji mora biti 1–7' })
    set.run('workdaysPerWeek', String(d))
  }
  res.json(readSettings())
})

export default router
