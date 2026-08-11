// Append-only audit trail for security-relevant actions. Logging must never
// break the action it records, so every write is best-effort (swallows errors).

import db from './db.js'

const stmt = db.prepare('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?, ?, ?, ?)')

function clientIp(req) {
  if (!req) return null
  return (req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || null
}

/**
 * @param {number|null} userId  actor (null for anonymous, e.g. failed login)
 * @param {string} action       short slug, e.g. 'login.success', 'user.delete'
 * @param {string} [detail]     human-readable context
 * @param {object} [req]        express request, for IP capture
 */
export function logAudit(userId, action, detail = null, req = null) {
  try {
    stmt.run(userId ?? null, action, detail, clientIp(req))
  } catch (e) {
    console.error('[audit] upis nije uspeo:', e.message)
  }
}
