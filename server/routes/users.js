import { Router } from 'express'
import bcrypt from 'bcrypt'
import db from '../db.js'
import { logAudit } from '../audit.js'

const router = Router()

function getUserRole(userId) {
  return db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role || 'user'
}

function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin'
}

function requireAdmin(req, res, next) {
  if (!isAdminRole(getUserRole(req.userId))) {
    return res.status(403).json({ error: 'Forbidden: admin only' })
  }
  next()
}

function requireSuperAdmin(req, res, next) {
  if (getUserRole(req.userId) !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden: super admin only' })
  }
  next()
}

function userWithOrg(u) {
  const projects = u.role === 'user'
    ? db.prepare(`
        SELECT p.id, p.epic_key as epicKey, p.display_name as displayName
        FROM project_clients pc
        JOIN projects p ON p.id = pc.project_id
        WHERE pc.client_user_id = ?
      `).all(u.id)
    : []
  return { ...u, projects }
}

// GET /api/users — list all non-self users
router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.organization_id as organizationId,
           o.name as organizationName, u.created_at as createdAt
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE u.id != ?
    ORDER BY u.role ASC, u.created_at ASC
  `).all(req.userId)

  res.json(users.map(userWithOrg))
})

// POST /api/users — create a new user
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role = 'user', organizationId } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Sva polja su obavezna' })
    }
    if (!['admin', 'user', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Nevalidna uloga' })
    }
    // Only super_admin can create other super_admins
    if (role === 'super_admin' && getUserRole(req.userId) !== 'super_admin') {
      return res.status(403).json({ error: 'Samo super admin može kreirati super admin nalog' })
    }
    const hash = await bcrypt.hash(password, 12)
    const result = db.prepare(
      'INSERT INTO users (email, password, name, role, organization_id) VALUES (?, ?, ?, ?, ?)'
    ).run(email.toLowerCase(), hash, name, role, organizationId || null)
    logAudit(req.userId, 'user.create', `kreiran ${email.toLowerCase()} (rola: ${role})`, req)

    const user = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.organization_id as organizationId,
             o.name as organizationName, u.created_at as createdAt
      FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = ?
    `).get(result.lastInsertRowid)
    res.json({ user: userWithOrg(user) })
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email je već registrovan' })
    }
    console.error(err)
    res.status(500).json({ error: 'Greška servera' })
  }
})

// PUT /api/users/:id — edit user
router.put('/:id', requireAdmin, async (req, res) => {
  const target = db.prepare('SELECT id, role FROM users WHERE id = ? AND id != ?').get(req.params.id, req.userId)
  if (!target) return res.status(404).json({ error: 'Korisnik nije pronađen' })

  // Only a super_admin may modify an existing super_admin account (blocks
  // an ordinary admin from resetting a super_admin's password / email).
  if (target.role === 'super_admin' && getUserRole(req.userId) !== 'super_admin') {
    return res.status(403).json({ error: 'Samo super admin može menjati super admin nalog' })
  }

  const { name, email, role, password, organizationId } = req.body
  if (!name || !email) return res.status(400).json({ error: 'Ime i email su obavezni' })
  if (role && !['admin', 'user', 'super_admin'].includes(role)) return res.status(400).json({ error: 'Nevalidna uloga' })
  // Only super_admin can promote to super_admin
  if (role === 'super_admin' && getUserRole(req.userId) !== 'super_admin') {
    return res.status(403).json({ error: 'Samo super admin može dodeliti super admin ulogu' })
  }

  try {
    const fields = ['name = ?', 'email = ?']
    const values = [name, email.toLowerCase()]

    if (role && role !== target.role) {
      fields.push('role = ?')
      values.push(role)
    }

    if (organizationId !== undefined) {
      fields.push('organization_id = ?')
      values.push(organizationId || null)
    }

    if (password?.trim()) {
      const hash = await bcrypt.hash(password.trim(), 12)
      fields.push('password = ?')
      values.push(hash)
    }

    values.push(req.params.id)
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    const changes = []
    if (password?.trim()) changes.push('lozinka resetovana')
    if (role && role !== target.role) changes.push(`rola ${target.role}→${role}`)
    logAudit(req.userId, 'user.update', `${email.toLowerCase()}${changes.length ? ' — ' + changes.join(', ') : ''}`, req)

    const updated = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.organization_id as organizationId,
             o.name as organizationName, u.created_at as createdAt
      FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = ?
    `).get(req.params.id)
    res.json({ user: userWithOrg(updated) })
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email je već registrovan' })
    console.error(err)
    res.status(500).json({ error: 'Greška servera' })
  }
})

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, role FROM users WHERE id = ? AND id != ?').get(req.params.id, req.userId)
  if (!user) return res.status(404).json({ error: 'Korisnik nije pronađen' })
  // Only a super_admin may delete a super_admin account.
  if (user.role === 'super_admin' && getUserRole(req.userId) !== 'super_admin') {
    return res.status(403).json({ error: 'Samo super admin može obrisati super admin nalog' })
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  logAudit(req.userId, 'user.delete', `obrisan korisnik id=${req.params.id} (rola: ${user.role})`, req)
  res.json({ ok: true })
})

// GET /api/users/:id/projects — list projects assigned to a user
router.get('/:id/projects', requireAdmin, (req, res) => {
  const projects = db.prepare(`
    SELECT p.id, p.epic_key as epicKey, p.display_name as displayName
    FROM project_clients pc
    JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ?
  `).all(req.params.id)
  res.json(projects)
})

// POST /api/users/:id/projects — assign project to user
router.post('/:id/projects', requireAdmin, (req, res) => {
  try {
    const { projectId } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId je obavezan' })

    // Verify project belongs to requesting admin/super_admin
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, req.userId)
    if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })

    db.prepare('INSERT OR IGNORE INTO project_clients (project_id, client_user_id) VALUES (?, ?)').run(projectId, req.params.id)
    logAudit(req.userId, 'user.project.assign', `projekat ${projectId} → korisnik ${req.params.id}`, req)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška servera' })
  }
})

// DELETE /api/users/:id/projects/:projectId — unassign project from user
router.delete('/:id/projects/:projectId', requireAdmin, (req, res) => {
  // Only the owning admin/super_admin may unassign a client from a project.
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.userId)
  if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
  db.prepare('DELETE FROM project_clients WHERE project_id = ? AND client_user_id = ?').run(req.params.projectId, req.params.id)
  logAudit(req.userId, 'user.project.unassign', `projekat ${req.params.projectId} ⊘ korisnik ${req.params.id}`, req)
  res.json({ ok: true })
})

// POST /api/users/import — bulk import users from CSV rows
router.post('/import', requireAdmin, async (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows niz je obavezan' })
  }

  const results = []

  for (const row of rows) {
    const name = row.name?.trim()
    const email = row.email?.trim()?.toLowerCase()
    const orgName = row.organization?.trim()
    const role = ['admin', 'user', 'super_admin'].includes(row.role?.trim()) ? row.role.trim() : 'user'

    if (!name || !email) {
      results.push({ email: email || '?', name: name || '?', status: 'error', reason: 'Ime i email su obavezni' })
      continue
    }

    // Check duplicate
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      results.push({ email, name, status: 'skipped', reason: 'Email već postoji' })
      continue
    }

    // Only super_admin can import super_admins
    if (role === 'super_admin' && getUserRole(req.userId) !== 'super_admin') {
      results.push({ email, name, status: 'error', reason: 'Nemate dozvolu za super_admin ulogu' })
      continue
    }

    try {
      // Resolve or create organization
      let organizationId = null
      if (orgName) {
        let org = db.prepare('SELECT id FROM organizations WHERE name = ?').get(orgName)
        if (!org) {
          const r = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(orgName)
          organizationId = r.lastInsertRowid
        } else {
          organizationId = org.id
        }
      }

      // Generate temp password
      const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase()
      const hash = await bcrypt.hash(tempPassword, 12)

      db.prepare('INSERT INTO users (email, password, name, role, organization_id) VALUES (?, ?, ?, ?, ?)').run(email, hash, name, role, organizationId)

      results.push({ email, name, status: 'created', tempPassword, organization: orgName || null, role })
    } catch (err) {
      results.push({ email, name, status: 'error', reason: err.message })
    }
  }

  res.json({ results })
})

export default router
