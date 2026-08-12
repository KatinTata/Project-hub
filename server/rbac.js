// Centralno mesto za role i autorizacione provere (P1-9).
// Duplirani lokalni helperi po rutama su direktan uzrok K1 propusta iz P0 —
// svaka nova ruta/fajl je morala da se seti da ih prepiše. Odavde se uvoze:
//   getRole(userId)          — rola iz baze, default 'user' (fail-closed)
//   roleFrom(req)            — req.userRole (postavlja authMiddleware) ili baza
//   isAdminRole / isSuperAdmin
//   requireAdmin / requireSuperAdmin — Express middleware
// Semantika je identična starim lokalnim kopijama (samo centralizovano).

import db from './db.js'

export function getRole(userId) {
  return db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role || 'user'
}

export function roleFrom(req) {
  return req.userRole || getRole(req.userId)
}

export function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin'
}

export function isSuperAdmin(role) {
  return role === 'super_admin'
}

export function requireAdmin(req, res, next) {
  if (!isAdminRole(roleFrom(req))) {
    return res.status(403).json({ error: 'Forbidden: admin only' })
  }
  next()
}

export function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(roleFrom(req))) {
    return res.status(403).json({ error: 'Forbidden: super admin only' })
  }
  next()
}
