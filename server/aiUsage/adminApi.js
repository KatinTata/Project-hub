// Agentic Admin API client — live proxy for AI token usage (no local storage
// of usage data). Spec: AI_TOKENI_MIGRACIJA_SPEC §1–§3.

import db from '../db.js'
import { decryptToken } from '../jiraClient.js'

const TIMEOUT_MS = 20000

export class AdminApiNotConfiguredError extends Error {
  constructor() { super('Agentic Admin API nije konfigurisan'); this.notConfigured = true }
}

export function getAdminConfig() {
  return db.prepare("SELECT * FROM integration_api_configs WHERE service_key = 'agentic_admin'").get()
}

function requireConfig() {
  const cfg = getAdminConfig()
  if (!cfg || !cfg.is_active || !cfg.base_url || !cfg.service_password_enc) throw new AdminApiNotConfiguredError()
  return { baseUrl: cfg.base_url.replace(/\/$/, ''), key: decryptToken(cfg.service_password_enc) }
}

export async function adminGet(pathname, params = {}, cfgOverride = null) {
  const { baseUrl, key } = cfgOverride || requireConfig()
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  const url = `${baseUrl}${pathname}${qs.toString() ? '?' + qs.toString() : ''}`
  const res = await fetch(url, { headers: { 'X-Admin-Key': key }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Admin API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  return res.json()
}

export const getTenants = () => adminGet('/api/admin/tenants')
export const getUsageSummary = (params) => adminGet('/api/admin/usage/ai/summary', params)
export const getServiceNames = () => adminGet('/api/admin/usage/ai/service-names')
export const getActions = () => adminGet('/api/admin/usage/ai/actions')
export const getModels = () => adminGet('/api/admin/usage/ai/models')

// ── Tenant identity map (§3.3) — one company appears under TWO GUIDs ─────────
// (SalesLeader tenantGuid + eProcurementTenantGuid). Canonical key = SL guid.
export function buildIdentityMap(tenants) {
  const map = new Map()
  for (const t of (tenants || [])) {
    const key = String(t.tenantGuid || '').toLowerCase()
    if (!key) continue
    map.set(key, { key, name: t.name || key, source: 'SalesLeader' })
    const ep = String(t.eProcurementTenantGuid || '').toLowerCase()
    if (ep) map.set(ep, { key, name: t.name || key, source: 'eProcurement' })
  }
  return map
}

export function resolveTenant(identityMap, tenantId) {
  const id = String(tenantId || '').toLowerCase()
  if (!id) return { key: 'unknown', name: 'Nepoznat', source: 'unknown' }
  return identityMap.get(id) || { key: id, name: tenantId, source: 'unknown' }
}

// Normalize a date range: default last 30 days; date-only `to` → end of day
// (critical for billing — the whole last day must be included, spec §7.0).
export function normalizeRange(from, to) {
  const now = new Date()
  let fromD = from ? new Date(from) : new Date(now.getTime() - 30 * 86400000)
  let toD = to ? new Date(to) : now
  if (typeof to === 'string' && to.length <= 10) {
    toD = new Date(to)
    toD.setHours(23, 59, 59, 999)
  }
  return { fromDate: fromD.toISOString(), toDate: toD.toISOString() }
}
