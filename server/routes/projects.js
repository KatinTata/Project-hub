import { Router } from 'express'
import db from '../db.js'
import { getRole as getUserRole, isAdminRole } from '../rbac.js'
import { dayInBelgrade } from '../dates.js'
import { logAudit } from '../audit.js'
import { upsertManual } from '../clientTaskTexts.js'

const router = Router()

// Ownership is strictly per-user for every admin role: each admin (including
// super_admins) sees and manages only the projects they created. Connections
// (Jira credentials, AI key) are still inherited from super-admins elsewhere.
function findAdminProject(projectId, userId) {
  return db.prepare('SELECT id, user_id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
}

router.get('/', (req, res) => {
  const role = getUserRole(req.userId)
  if (role === 'user') {
    const projects = db.prepare(`
      SELECT p.id, p.epic_key as epicKey, p.display_name as displayName, p.position, p.user_id as ownerId,
             p.filter_type as filterType, p.filter_jql as filterJql, p.filter_meta as filterMeta, p.client_lang as clientLang, p.created_at as createdAt
      FROM project_clients pc
      JOIN projects p ON p.id = pc.project_id
      WHERE pc.client_user_id = ? AND (p.archived IS NULL OR p.archived = 0)
      ORDER BY p.position ASC, p.id ASC
    `).all(req.userId)
    return res.json(projects)
  }
  // Projects are strictly per-user — every admin sees only their own.
  const projects = db.prepare(
    'SELECT id, epic_key as epicKey, display_name as displayName, position, filter_type as filterType, filter_jql as filterJql, filter_meta as filterMeta, client_lang as clientLang, created_at as createdAt FROM projects WHERE user_id = ? AND (archived IS NULL OR archived = 0) ORDER BY position ASC, id ASC'
  ).all(req.userId)
  res.json(projects)
})

// ── Klijentski tekstovi taskova (prevod + generisan opis) ─────────────────────

// Uključi/isključi jezik klijentskog prikaza (NULL = isključeno); generisanje
// se pokreće pri prvom sledećem učitavanju taskova.
const CLIENT_LANGS = ['en', 'de', 'bg']
router.put('/:id/client-lang', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const lang = req.body?.lang || null
  if (lang !== null && !CLIENT_LANGS.includes(lang)) return res.status(400).json({ error: 'Nepodržan jezik' })
  db.prepare('UPDATE projects SET client_lang = ? WHERE id = ?').run(lang, req.params.id)
  logAudit(req.userId, 'project.client_lang', `projekat ${req.params.id} → ${lang || 'isključeno'}`, req)
  res.json({ ok: true, clientLang: lang })
})

// Ručna izmena teksta jednog taska (admin „provera") — edited_by blokira
// automatsku regeneraciju preko izmene.
router.put('/:id/client-texts/:taskKey', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const lang = db.prepare('SELECT client_lang FROM projects WHERE id = ?').get(req.params.id)?.client_lang
  if (!lang) return res.status(400).json({ error: 'Klijentski jezik nije uključen za projekat' })
  const { title, one_liner } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'Naslov je obavezan' })
  upsertManual(project.id, String(req.params.taskKey), lang, { title, one_liner }, req.userId)
  res.json({ ok: true })
})

// Regeneracija: briše automatski generisane redove (ručne izmene ostaju);
// novi tekstovi nastaju pri prvom sledećem učitavanju taskova.
router.post('/:id/client-texts/regenerate', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const r = db.prepare('DELETE FROM task_client_texts WHERE project_id = ? AND edited_by IS NULL').run(project.id)
  logAudit(req.userId, 'project.client_texts.regen', `projekat ${project.id} — obrisano ${r.changes}`, req)
  res.json({ ok: true, cleared: r.changes })
})

router.post('/', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  try {
    const { epicKey, displayName, filterType = 'epic', filterJql, filterMeta } = req.body

    // For epic mode, epicKey is required; for jql/combined, generate a unique key
    let resolvedKey
    if (filterType === 'epic') {
      if (!epicKey) return res.status(400).json({ error: 'epicKey je obavezan za Epic mode' })
      resolvedKey = epicKey.trim().toUpperCase()
    } else {
      resolvedKey = `${filterType.toUpperCase()}-${Date.now()}`
    }

    if (!displayName?.trim() && filterType !== 'epic') {
      return res.status(400).json({ error: 'Naziv projekta je obavezan' })
    }

    const maxPos = db.prepare('SELECT MAX(position) as m FROM projects WHERE user_id = ?').get(req.userId)
    const position = (maxPos?.m ?? -1) + 1

    const result = db.prepare(
      'INSERT INTO projects (user_id, epic_key, display_name, position, filter_type, filter_jql, filter_meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.userId, resolvedKey, displayName?.trim() || null, position, filterType, filterJql || null, filterMeta ? JSON.stringify(filterMeta) : null)

    const project = db.prepare(
      'SELECT id, epic_key as epicKey, display_name as displayName, position, filter_type as filterType, filter_jql as filterJql, filter_meta as filterMeta FROM projects WHERE id = ?'
    ).get(result.lastInsertRowid)

    res.json({ project })
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Projekat već postoji' })
    }
    res.status(500).json({ error: 'Greška servera' })
  }
})

// Archive (soft delete)
router.delete('/:id', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const now = new Date().toISOString()
  db.prepare('UPDATE projects SET archived = 1, archived_at = ? WHERE id = ?').run(now, req.params.id)
  logAudit(req.userId, 'project.archive', `projekat ${req.params.id}`, req)
  res.json({ ok: true })
})

// Get archived projects
router.get('/archived', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const projects = db.prepare(
    'SELECT id, epic_key as epicKey, display_name as displayName, archived_at as archivedAt, filter_type as filterType FROM projects WHERE user_id = ? AND archived = 1 ORDER BY archived_at DESC'
  ).all(req.userId)
  res.json(projects)
})

// Restore from archive
router.put('/:id/restore', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  db.prepare('UPDATE projects SET archived = 0, archived_at = NULL WHERE id = ?').run(req.params.id)
  const restored = db.prepare(
    'SELECT id, epic_key as epicKey, display_name as displayName, position, filter_type as filterType, filter_jql as filterJql, filter_meta as filterMeta FROM projects WHERE id = ?'
  ).get(req.params.id)
  res.json({ project: restored })
})

// Permanent delete
router.delete('/:id/permanent', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  logAudit(req.userId, 'project.delete.permanent', `projekat ${req.params.id} trajno obrisan`, req)
  res.json({ ok: true })
})

// Get billable task keys for a project
router.get('/:id/billable', (req, res) => {
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const rows = db.prepare('SELECT task_key FROM task_billable WHERE project_id = ?').all(req.params.id)
  res.json(rows.map(r => r.task_key))
})

// Toggle billable for a task
router.put('/:id/billable', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const { taskKey, billable } = req.body
  if (!taskKey) return res.status(400).json({ error: 'taskKey je obavezan' })
  if (billable) {
    db.prepare('INSERT OR IGNORE INTO task_billable (project_id, task_key) VALUES (?, ?)').run(req.params.id, taskKey)
  } else {
    db.prepare('DELETE FROM task_billable WHERE project_id = ? AND task_key = ?').run(req.params.id, taskKey)
  }
  res.json({ ok: true })
})

// Per-project team size per stack (capacity planning)
const VALID_STACKS = ['Backend', 'Frontend', 'Mobile', 'Database', 'Testing', 'Ostalo']

router.get('/:id/stack-people', (req, res) => {
  const role = getUserRole(req.userId)
  const access = isAdminRole(role)
    ? findAdminProject(req.params.id, req.userId)
    : db.prepare('SELECT p.id FROM project_clients pc JOIN projects p ON p.id = pc.project_id WHERE pc.client_user_id = ? AND p.id = ?').get(req.userId, req.params.id)
  if (!access) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const rows = db.prepare('SELECT stack, people FROM project_stack_people WHERE project_id = ?').all(req.params.id)
  const map = {}
  for (const r of rows) map[r.stack] = r.people
  res.json(map)
})

router.put('/:id/stack-people', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const people = req.body?.people || {}
  const up = db.prepare('INSERT INTO project_stack_people (project_id, stack, people) VALUES (?, ?, ?) ON CONFLICT(project_id, stack) DO UPDATE SET people = excluded.people')
  db.transaction(() => {
    for (const [stack, n] of Object.entries(people)) {
      if (!VALID_STACKS.includes(stack)) continue
      const v = Math.max(1, Math.min(50, parseInt(n, 10) || 1))
      up.run(req.params.id, stack, v)
    }
  })()
  const rows = db.prepare('SELECT stack, people FROM project_stack_people WHERE project_id = ?').all(req.params.id)
  const map = {}
  for (const r of rows) map[r.stack] = r.people
  res.json(map)
})

// Curated team roster (named people per stack)
router.get('/:id/team', (req, res) => {
  const role = getUserRole(req.userId)
  const access = isAdminRole(role)
    ? findAdminProject(req.params.id, req.userId)
    : db.prepare('SELECT p.id FROM project_clients pc JOIN projects p ON p.id = pc.project_id WHERE pc.client_user_id = ? AND p.id = ?').get(req.userId, req.params.id)
  if (!access) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const rows = db.prepare('SELECT id, name, stack FROM project_team WHERE project_id = ? ORDER BY stack, name').all(req.params.id)
  res.json(rows)
})

router.post('/:id/team', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const name = (req.body?.name || '').trim()
  const stack = req.body?.stack
  if (!name) return res.status(400).json({ error: 'Ime je obavezno' })
  if (!VALID_STACKS.includes(stack)) return res.status(400).json({ error: 'Nevalidan stek' })
  try {
    const r = db.prepare('INSERT INTO project_team (project_id, name, stack) VALUES (?, ?, ?)').run(req.params.id, name, stack)
    res.json({ member: { id: r.lastInsertRowid, name, stack } })
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Već u timu za taj stek' })
    res.status(500).json({ error: 'Greška servera' })
  }
})

router.delete('/:id/team/:memberId', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  db.prepare('DELETE FROM project_team WHERE id = ? AND project_id = ?').run(req.params.memberId, req.params.id)
  res.json({ ok: true })
})

// Daily snapshots (history / trends)
router.post('/:id/snapshot', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const payload = req.body?.payload
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload je obavezan' })
  const day = dayInBelgrade(new Date()) // ista konvencija dana kao serverski snapshot job (P2-E3)
  db.prepare('INSERT INTO project_snapshots (project_id, day, payload) VALUES (?, ?, ?) ON CONFLICT(project_id, day) DO UPDATE SET payload = excluded.payload, created_at = CURRENT_TIMESTAMP')
    .run(req.params.id, day, JSON.stringify(payload))
  res.json({ ok: true, day })
})

router.get('/:id/snapshots', (req, res) => {
  const role = getUserRole(req.userId)
  const access = isAdminRole(role)
    ? findAdminProject(req.params.id, req.userId)
    : db.prepare('SELECT p.id FROM project_clients pc JOIN projects p ON p.id = pc.project_id WHERE pc.client_user_id = ? AND p.id = ?').get(req.userId, req.params.id)
  if (!access) return res.status(404).json({ error: 'Projekat nije pronađen' })
  // P2-B6: default poslednjih 366 dana — dovoljno za godišnji trend, a projekat
  // sa višegodišnjom istorijom ne šalje sve. ?limit menja opseg.
  const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 366))
  const rows = db.prepare('SELECT day, payload FROM (SELECT day, payload FROM project_snapshots WHERE project_id = ? ORDER BY day DESC LIMIT ?) ORDER BY day ASC').all(req.params.id, limit)
  const isClient = !isAdminRole(role)
  res.json(rows.map(r => {
    let payload = {}
    try { payload = JSON.parse(r.payload) } catch { /* pokvaren payload — prazan dan */ }
    // Klijent (rola user) dobija SAMO brojeve stavki po statusu; interni sati
    // (totalEst/totalSpent/billableSpent/stacks) se ne šalju (P3-1 politika).
    if (isClient) {
      const { total = 0, done = 0, inprog = 0, testing = 0, todo = 0, unknown = 0 } = payload
      return { day: r.day, total, done, inprog, testing, todo, unknown }
    }
    return { day: r.day, ...payload }
  }))
})

router.put('/reorder', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  try {
    const { ids } = req.body
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids mora biti niz' })

    const update = db.prepare('UPDATE projects SET position = ? WHERE id = ? AND user_id = ?')
    const updateMany = db.transaction((ids) => {
      ids.forEach((id, idx) => update.run(idx, id, req.userId))
    })
    updateMany(ids)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Greška servera' })
  }
})

// Update a project's filter criteria / name. Defined AFTER /reorder so that
// PUT /projects/reorder never matches :id.
router.put('/:id', (req, res) => {
  if (!isAdminRole(getUserRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const project = findAdminProject(req.params.id, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  const { displayName, filterType, filterJql, filterMeta, epicKey } = req.body
  if (!filterJql?.trim() && filterType !== 'epic') return res.status(400).json({ error: 'JQL je obavezan' })
  db.prepare('UPDATE projects SET display_name = ?, filter_type = ?, filter_jql = ?, filter_meta = ?, epic_key = COALESCE(?, epic_key) WHERE id = ?')
    .run(displayName?.trim() || null, filterType || 'combined', filterJql || null, filterMeta ? JSON.stringify(filterMeta) : null, epicKey?.trim() || null, req.params.id)
  const updated = db.prepare(
    'SELECT id, epic_key as epicKey, display_name as displayName, position, filter_type as filterType, filter_jql as filterJql, filter_meta as filterMeta, created_at as createdAt FROM projects WHERE id = ?'
  ).get(req.params.id)
  res.json({ project: updated })
})

export default router
