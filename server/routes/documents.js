import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import db from '../db.js'
import { logAudit } from '../audit.js'
import { getRole, isAdminRole } from '../rbac.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '../../data/uploads')

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`),
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

const router = Router()

function canClientSee(doc, userId) {
  if (doc.visible_to === 'all') return true
  try {
    const ids = JSON.parse(doc.visible_to)
    return Array.isArray(ids) && ids.includes(userId)
  } catch { return false }
}

// ── Sections ──────────────────────────────────────────────────────────────────

router.get('/sections', (req, res) => {
  const role = getRole(req.userId)
  if (!isAdminRole(role)) {
    // Only return sections from admins who have this client in their projects
    const adminIds = db.prepare(`
      SELECT DISTINCT p.user_id FROM project_clients pc
      JOIN projects p ON p.id = pc.project_id
      WHERE pc.client_user_id = ?
    `).all(req.userId).map(r => r.user_id)
    if (adminIds.length === 0) return res.json([])
    const ph = adminIds.map(() => '?').join(',')
    const allSections = db.prepare(`SELECT * FROM document_sections WHERE user_id IN (${ph}) ORDER BY position, created_at`).all(...adminIds)
    const allDocs = db.prepare(`SELECT section_id, visible_to FROM documents WHERE user_id IN (${ph})`).all(...adminIds)
    const visible = allSections.filter(s =>
      allDocs.some(d => d.section_id === s.id && canClientSee(d, req.userId))
    )
    return res.json(visible)
  }
  const sections = db.prepare(
    'SELECT * FROM document_sections WHERE user_id = ? ORDER BY position, created_at'
  ).all(req.userId)
  res.json(sections)
})

router.post('/sections', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Naziv je obavezan' })
  const r = db.prepare(
    'INSERT INTO document_sections (user_id, name) VALUES (?, ?)'
  ).run(req.userId, name.trim())
  res.json({ id: r.lastInsertRowid, user_id: req.userId, name: name.trim(), position: 0 })
})

router.put('/sections/:id', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Naziv je obavezan' })
  db.prepare('UPDATE document_sections SET name = ? WHERE id = ? AND user_id = ?')
    .run(name.trim(), req.params.id, req.userId)
  res.json({ ok: true })
})

router.delete('/sections/:id', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  db.prepare('DELETE FROM document_sections WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId)
  res.json({ ok: true })
})

// ── Documents ─────────────────────────────────────────────────────────────────

const META = 'id, user_id, section_id, name, original_name, file_size, thumbnail, visible_to, created_at'

router.get('/', (req, res) => {
  const role = getRole(req.userId)
  if (!isAdminRole(role)) {
    // Client sees only documents from admins they're linked to (via assigned projects),
    // and only those marked visible to them.
    const adminIds = db.prepare(`
      SELECT DISTINCT p.user_id FROM project_clients pc
      JOIN projects p ON p.id = pc.project_id
      WHERE pc.client_user_id = ?
    `).all(req.userId).map(r => r.user_id)
    if (adminIds.length === 0) return res.json([])
    const ph = adminIds.map(() => '?').join(',')
    const docs = db.prepare(
      `SELECT ${META} FROM documents WHERE user_id IN (${ph}) ORDER BY created_at DESC`
    ).all(...adminIds)
    return res.json(docs.filter(d => canClientSee(d, req.userId)))
  }
  const docs = db.prepare(
    `SELECT ${META} FROM documents WHERE user_id = ? ORDER BY created_at DESC`
  ).all(req.userId)
  res.json(docs)
})

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fajl je prevelik (max 50MB)' })
      return res.status(400).json({ error: err.message })
    }
    next()
  })
}, async (req, res) => {
  try {
    if (!isAdminRole(getRole(req.userId))) {
      if (req.file) fs.unlink(req.file.path, () => {})
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (!req.file) return res.status(400).json({ error: 'Fajl je obavezan' })
    if (req.file.mimetype !== 'application/pdf') {
      fs.unlink(req.file.path, () => {})
      return res.status(400).json({ error: 'Samo PDF fajlovi su podržani' })
    }
    // Validate real content, not just the client-supplied Content-Type: a PDF
    // must begin with the "%PDF-" magic bytes.
    try {
      const fd = fs.openSync(req.file.path, 'r')
      const head = Buffer.alloc(5)
      fs.readSync(fd, head, 0, 5, 0)
      fs.closeSync(fd)
      if (head.toString('latin1') !== '%PDF-') {
        fs.unlink(req.file.path, () => {})
        return res.status(400).json({ error: 'Fajl nije validan PDF' })
      }
    } catch {
      if (req.file) fs.unlink(req.file.path, () => {})
      return res.status(400).json({ error: 'Nije moguće pročitati fajl' })
    }

    const { name, section_id, visible_to } = req.body
    if (!name?.trim()) {
      fs.unlink(req.file.path, () => {})
      return res.status(400).json({ error: 'Naziv je obavezan' })
    }

    const visibleTo = visible_to || 'all'
    const filePath = req.file.filename

    const r = db.prepare(
      'INSERT INTO documents (user_id, section_id, name, original_name, file_data, file_size, thumbnail, visible_to, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      req.userId,
      section_id ? parseInt(section_id) : null,
      name.trim(),
      req.file.originalname,
      Buffer.alloc(0),
      req.file.size,
      null,
      visibleTo,
      filePath
    )

    logAudit(req.userId, 'document.upload', `dokument ${r.lastInsertRowid} (${req.file.originalname}, ${req.file.size} B, vidljivost: ${visibleTo})`, req)
    res.json({
      id: r.lastInsertRowid,
      user_id: req.userId,
      section_id: section_id ? parseInt(section_id) : null,
      name: name.trim(),
      original_name: req.file.originalname,
      file_size: req.file.size,
      thumbnail: null,
      visible_to: visibleTo,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {})
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

router.get('/:id/download', (req, res) => {
  try {
    const role = getRole(req.userId)
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Dokument nije pronađen' })

    if (isAdminRole(role)) {
      // Strictly per-user: an admin may only download their own documents.
      if (Number(doc.user_id) !== Number(req.userId)) {
        return res.status(403).json({ error: 'Pristup odbijen' })
      }
    } else {
      // Must be linked to the document's owner admin AND the doc must be visible to them
      const linked = db.prepare(`
        SELECT 1 FROM project_clients pc
        JOIN projects p ON p.id = pc.project_id
        WHERE pc.client_user_id = ? AND p.user_id = ? LIMIT 1
      `).get(req.userId, doc.user_id)
      if (!linked || !canClientSee(doc, req.userId)) {
        return res.status(403).json({ error: 'Pristup odbijen' })
      }
    }

    logAudit(req.userId, 'document.download', `dokument ${doc.id} (${doc.original_name})`, req)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`)

    // New: file stored on disk
    if (doc.file_path) {
      const fullPath = path.join(uploadsDir, doc.file_path)
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Fajl nije pronađen na disku' })
      if (doc.file_size) res.setHeader('Content-Length', doc.file_size)
      return fs.createReadStream(fullPath).pipe(res)
    }

    // Legacy: file stored as BLOB in SQLite
    if (doc.file_size) res.setHeader('Content-Length', doc.file_size)
    res.send(doc.file_data)
  } catch (err) {
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

router.delete('/:id', (req, res) => {
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Forbidden' })
  const doc = db.prepare('SELECT file_path FROM documents WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
  if (doc?.file_path) {
    fs.unlink(path.join(uploadsDir, doc.file_path), () => {})
  }
  const r = db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)
  if (r.changes > 0) logAudit(req.userId, 'document.delete', `dokument ${req.params.id}`, req)
  res.json({ ok: true })
})

export default router
