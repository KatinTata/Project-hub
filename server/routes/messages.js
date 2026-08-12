import { Router } from 'express'
import db from '../db.js'
import { getRole as getUserRole, isAdminRole } from '../rbac.js'

const router = Router()

function getAccessibleProjectIds(userId, role) {
  if (role === 'user') {
    return db.prepare('SELECT project_id as id FROM project_clients WHERE client_user_id = ?').all(userId).map(r => r.id)
  }
  return db.prepare('SELECT id FROM projects WHERE user_id = ?').all(userId).map(r => r.id)
}

function checkProjectAccess(userId, projectId, role) {
  if (role === 'user') {
    return db.prepare('SELECT 1 FROM project_clients WHERE project_id = ? AND client_user_id = ?').get(projectId, userId)
  }
  return db.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
}

// Visibility filter for client: sees messages addressed to them or to all.
// Vraća { sql, params } — userId ide kroz placeholder, nikad interpolacijom.
function clientMsgFilter(userId) {
  return { sql: '(m.recipient_user_id IS NULL OR m.recipient_user_id = ?)', params: [userId] }
}
const NO_FILTER = { sql: '1=1', params: [] }

// GET /api/messages/unread-count
router.get('/unread-count', (req, res) => {
  const role = getUserRole(req.userId)
  const projectIds = getAccessibleProjectIds(req.userId, role)
  if (!projectIds.length) return res.json({ count: 0 })

  const ph = projectIds.map(() => '?').join(',')
  const recipientFilter = role === 'user' ? clientMsgFilter(req.userId) : NO_FILTER

  const row = db.prepare(`
    SELECT COUNT(*) as c FROM messages m
    WHERE m.project_id IN (${ph})
      AND m.sender_id != ?
      AND ${recipientFilter.sql}
      AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?)
  `).get(...projectIds, req.userId, ...recipientFilter.params, req.userId)

  res.json({ count: row.c })
})

// GET /api/messages/recent-unread
router.get('/recent-unread', (req, res) => {
  const role = getUserRole(req.userId)
  const projectIds = getAccessibleProjectIds(req.userId, role)
  if (!projectIds.length) return res.json([])

  const ph = projectIds.map(() => '?').join(',')
  const recipientFilter = role === 'user' ? clientMsgFilter(req.userId) : NO_FILTER

  const messages = db.prepare(`
    SELECT m.id, m.project_id, m.text, m.task_key, m.created_at,
           u.name as sender_name,
           p.display_name as project_name, p.epic_key
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    JOIN projects p ON p.id = m.project_id
    WHERE m.project_id IN (${ph})
      AND m.sender_id != ?
      AND ${recipientFilter.sql}
      AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?)
    ORDER BY m.created_at DESC
    LIMIT 5
  `).all(...projectIds, req.userId, ...recipientFilter.params, req.userId)

  res.json(messages)
})

// PUT /api/messages/read-all
router.put('/read-all', (req, res) => {
  const role = getUserRole(req.userId)
  const projectIds = getAccessibleProjectIds(req.userId, role)
  if (!projectIds.length) return res.json({ ok: true })

  const ph = projectIds.map(() => '?').join(',')
  const recipientFilter = role === 'user' ? clientMsgFilter(req.userId) : NO_FILTER

  const unread = db.prepare(`
    SELECT id FROM messages m
    WHERE m.project_id IN (${ph})
      AND m.sender_id != ?
      AND ${recipientFilter.sql}
      AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?)
  `).all(...projectIds, req.userId, ...recipientFilter.params, req.userId)

  const insert = db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)')
  db.transaction(() => { unread.forEach(m => insert.run(m.id, req.userId)) })()

  res.json({ ok: true })
})

// GET /api/messages/:projectId/clients — list of clients on this project (admin only)
router.get('/:projectId/clients', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  const role = getUserRole(req.userId)
  if (!isAdminRole(role)) return res.status(403).json({ error: 'Forbidden' })
  if (!checkProjectAccess(req.userId, projectId, role)) return res.status(403).json({ error: 'Forbidden' })

  const clients = db.prepare(`
    SELECT u.id, u.name, u.email FROM project_clients pc
    JOIN users u ON u.id = pc.client_user_id
    WHERE pc.project_id = ?
    ORDER BY u.name ASC
  `).all(projectId)

  res.json(clients)
})

// GET /api/messages/:projectId/export — CSV export (admin only)
router.get('/:projectId/export', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  const role = getUserRole(req.userId)
  if (!isAdminRole(role)) return res.status(403).json({ error: 'Forbidden' })
  if (!checkProjectAccess(req.userId, projectId, role)) return res.status(403).json({ error: 'Forbidden' })

  const { taskKey } = req.query
  const project = db.prepare('SELECT display_name, epic_key FROM projects WHERE id = ?').get(projectId)

  const taskFilter = taskKey ? 'AND m.task_key = ?' : ''
  const params = taskKey ? [projectId, taskKey] : [projectId]

  const messages = db.prepare(`
    SELECT m.text, m.task_key, m.task_summary, m.subject, m.created_at,
           sender.name as sender_name,
           recip.name as recipient_name
    FROM messages m
    JOIN users sender ON sender.id = m.sender_id
    LEFT JOIN users recip ON recip.id = m.recipient_user_id
    WHERE m.project_id = ? ${taskFilter}
    ORDER BY m.task_key ASC, m.created_at ASC
  `).all(...params)

  // Proper columns: Tema | Naziv taska | Datum i vreme | Pošiljalac | Primalac | Poruka
  const header = 'Tema;Naziv taska;Datum i vreme;Pošiljalac;Primalac;Poruka'
  const rows = messages.map(m => {
    const tema = m.subject || m.task_key || '(bez teme)'
    const naziv = m.task_summary || ''
    const date = new Date(m.created_at).toLocaleString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const recipient = m.recipient_name || 'Svi klijenti'
    const text = `"${(m.text || '').replace(/"/g, '""')}"`
    return [tema, naziv, date, m.sender_name, recipient, text].join(';')
  })

  const suffix = taskKey ? `-${taskKey}` : ''
  const csv = '\uFEFF' + [header, ...rows].join('\r\n')
  const filename = `poruke-${project?.epic_key || projectId}${suffix}-${new Date().toISOString().slice(0, 10)}.csv`

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
})

// GET /api/messages/:projectId
router.get('/:projectId', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  const role = getUserRole(req.userId)
  if (!checkProjectAccess(req.userId, projectId, role)) return res.status(403).json({ error: 'Forbidden' })

  const recipientFilter = role === 'user'
    ? { sql: 'AND (m.recipient_user_id IS NULL OR m.recipient_user_id = ? OR m.sender_id = ?)', params: [req.userId, req.userId] }
    : { sql: '', params: [] }

  const messages = db.prepare(`
    SELECT m.id, m.text, m.task_key, m.task_summary, m.subject, m.created_at, m.sender_id, m.recipient_user_id,
           sender.name as sender_name, sender.role as sender_role,
           recip.name as recipient_name,
           CASE WHEN mr.message_id IS NOT NULL OR m.sender_id = ? THEN 1 ELSE 0 END as is_read
    FROM messages m
    JOIN users sender ON sender.id = m.sender_id
    LEFT JOIN users recip ON recip.id = m.recipient_user_id
    LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
    WHERE m.project_id = ? ${recipientFilter.sql}
    ORDER BY m.created_at ASC
  `).all(req.userId, req.userId, projectId, ...recipientFilter.params)

  // Auto-mark as read
  const unread = messages.filter(m => !m.is_read)
  if (unread.length) {
    const insert = db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)')
    db.transaction(() => { unread.forEach(m => insert.run(m.id, req.userId)) })()
  }

  res.json(messages)
})

// POST /api/messages/:projectId
router.post('/:projectId', (req, res) => {
  const projectId = parseInt(req.params.projectId)
  const role = getUserRole(req.userId)
  if (!checkProjectAccess(req.userId, projectId, role)) return res.status(403).json({ error: 'Forbidden' })

  const { text, task_key, task_summary, subject, recipient_user_id } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'Tekst je obavezan' })

  // Validate recipient belongs to this project (admin only)
  let resolvedRecipient = null
  if (isAdminRole(role) && recipient_user_id) {
    const exists = db.prepare('SELECT 1 FROM project_clients WHERE project_id = ? AND client_user_id = ?').get(projectId, recipient_user_id)
    if (exists) resolvedRecipient = recipient_user_id
  }

  const result = db.prepare(
    'INSERT INTO messages (project_id, sender_id, text, task_key, task_summary, subject, recipient_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, req.userId, text.trim(), task_key || null, task_summary || null, subject?.trim() || null, resolvedRecipient)

  const user = db.prepare('SELECT name, role FROM users WHERE id = ?').get(req.userId)
  const recipUser = resolvedRecipient ? db.prepare('SELECT name FROM users WHERE id = ?').get(resolvedRecipient) : null

  res.json({
    message: {
      id: result.lastInsertRowid,
      text: text.trim(),
      task_key: task_key || null,
      task_summary: task_summary || null,
      subject: subject?.trim() || null,
      recipient_user_id: resolvedRecipient,
      recipient_name: recipUser?.name || null,
      created_at: new Date().toISOString(),
      sender_id: req.userId,
      sender_name: user.name,
      sender_role: user.role,
      is_read: 1,
    },
  })
})

export default router
