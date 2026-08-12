import { Router } from 'express'
import db from '../db.js'
import { getRole } from '../rbac.js'

const router = Router()

// Defaulti IDENTIČNI ranije hardkodovanim vrednostima (P2-E2) — bez
// podešavanja se ponašanje ne menja.
const DEFAULTS = {
  workdayHours: 6.5,
  workdaysPerWeek: 5,
  overrunThresholdPct: 15, // prag prekoračenja taska (utils.js)
  capacityTightPct: 85,    // load iznad ovoga = "tight" (capacity.js)
  overrunTailPct: 10,      // rep preostalog rada za probijene otvorene taskove (stacks.js)
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
    overrunThresholdPct: num('overrunThresholdPct', DEFAULTS.overrunThresholdPct),
    capacityTightPct: num('capacityTightPct', DEFAULTS.capacityTightPct),
    overrunTailPct: num('overrunTailPct', DEFAULTS.overrunTailPct),
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
  // Pragovi obračuna (P2-E2) — procenti 0–100
  for (const key of ['overrunThresholdPct', 'capacityTightPct', 'overrunTailPct']) {
    if (req.body[key] !== undefined) {
      const v = parseFloat(req.body[key])
      if (!(v >= 0 && v <= 100)) return res.status(400).json({ error: `${key} mora biti između 0 i 100` })
      set.run(key, String(v))
    }
  }
  res.json(readSettings())
})

export default router
