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
    const row = db.prepare('SELECT id, role, token_version FROM users WHERE id = ?').get(payload.userId)
    if (!row) return res.status(401).json({ error: 'Unauthorized' })
    // P1-11: token izdat pre promene lozinke/role nosi stariji tv → 401.
    // Stariji tokeni bez tv se tretiraju kao tv=0 (važe dok se verzija ne digne).
    if ((payload.tv ?? 0) !== (row.token_version || 0)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    req.userId = row.id
    req.userRole = row.role || 'user'
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}
