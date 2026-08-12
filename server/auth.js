import jwt from 'jsonwebtoken'
import db from './db.js'

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(payload.userId)
    if (!row) return res.status(401).json({ error: 'Unauthorized' })
    req.userId = row.id
    req.userRole = row.role || 'user'
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}
