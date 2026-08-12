// FAQ iz baze (P2-E1): svi ulogovani čitaju, admini menjaju bez deploya.
// Odgovor je HTML — na upisu prolazi sanitize-html (dozvoljeni inline stilovi
// jer sadržaj pišu isključivo admini, ali skripte/event handleri se skidaju).
import { Router } from 'express'
import sanitizeHtml from 'sanitize-html'
import db from '../db.js'
import { requireAdmin } from '../rbac.js'
import { logAudit } from '../audit.js'

const router = Router()

const SANITIZE_OPTS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['span', 'img', 'figure', 'figcaption']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['style', 'class'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
  },
  allowedSchemes: ['http', 'https', 'data'],
}

const cleanAnswer = html => sanitizeHtml(String(html || ''), SANITIZE_OPTS)

router.get('/', (req, res) => {
  const lang = ['sr', 'en'].includes(req.query.lang) ? req.query.lang : 'sr'
  const rows = db.prepare(
    'SELECT id, category, lang, question, answer, keywords, position FROM faq WHERE lang = ? ORDER BY category, position, id'
  ).all(lang)
  res.json({ faq: rows })
})

router.post('/', requireAdmin, (req, res) => {
  const { category, lang, question, answer, keywords, position } = req.body || {}
  if (!category?.trim() || !question?.trim() || !answer?.trim()) {
    return res.status(400).json({ error: 'category, question i answer su obavezni' })
  }
  const l = ['sr', 'en'].includes(lang) ? lang : 'sr'
  const r = db.prepare(
    'INSERT INTO faq (category, lang, question, answer, keywords, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(category.trim(), l, question.trim(), cleanAnswer(answer), (keywords || '').trim(), Number(position) || 0)
  logAudit(req.userId, 'faq.create', `pitanje ${r.lastInsertRowid} (${category.trim()}/${l})`, req)
  res.json({ id: r.lastInsertRowid })
})

router.put('/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM faq WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Pitanje nije pronađeno' })
  const { category, question, answer, keywords, position } = req.body || {}
  if (!category?.trim() || !question?.trim() || !answer?.trim()) {
    return res.status(400).json({ error: 'category, question i answer su obavezni' })
  }
  db.prepare(
    'UPDATE faq SET category = ?, question = ?, answer = ?, keywords = ?, position = ? WHERE id = ?'
  ).run(category.trim(), question.trim(), cleanAnswer(answer), (keywords || '').trim(), Number(position) || 0, req.params.id)
  logAudit(req.userId, 'faq.update', `pitanje ${req.params.id}`, req)
  res.json({ ok: true })
})

router.delete('/:id', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM faq WHERE id = ?').run(req.params.id)
  if (r.changes > 0) logAudit(req.userId, 'faq.delete', `pitanje ${req.params.id}`, req)
  res.json({ ok: true })
})

export default router
