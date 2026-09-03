// Agentic Admin API client — live proxy for AI token usage (no local storage
// of usage data). Spec: AI_TOKENI_MIGRACIJA_SPEC §1–§3.

import db from '../db.js'
import { decryptToken } from '../jiraClient.js'
import { startOfDayBelgrade, endOfDayBelgrade } from '../dates.js'

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

// ── Grupisanje akcija u servise ───────────────────────────────────────────────
// Prikaz ide po servisu (serviceName), ne po sirovim akcijama: prefiks pre
// '__' je ime servisa (npr. SqlDataBI__read_records → SqlDataBI); samostalne
// akcije su mapirane ručno — pripadnost utvrđena empirijski kombinovanim
// filterom action+serviceName na Admin API-ju (probe, 03.09.2026). Napomena:
// serviceName filter na API-ju radi kao case-insensitive contains, pa se za
// grupisanje NE koristi fan-out po servisima (preklapali bi se: 'SqlData'
// hvata i sve SqlData* podservise) nego se grupišu redovi dobijeni po akcijama.
const STANDALONE_ACTION_SERVICE = {
  AgentQuery: 'Intelisale.Agentic.Api',
  agentic_query: 'Intelisale.Agentic.Api',
  SpeechTranscribe: 'Intelisale.Agentic.Api',
  DocumentAnalysis: 'PdfReaderService',
  EmailDocumentAnalysis: 'PdfReaderService',
  EmailPdfAnalysis: 'PdfReaderService',
  ManualDocumentUpload: 'PdfReaderService',
  ManualPdfUpload: 'PdfReaderService',
  TranslateTexts: 'Translation',
}

export function serviceOfAction(action) {
  if (!action) return null // red „Ostalo" (bez akcije / preko limita)
  const i = action.indexOf('__')
  if (i > 0) return action.slice(0, i)
  return STANDALONE_ACTION_SERVICE[action] || action
}

export function groupAppsByService(apps, costKey) {
  const groups = {}
  for (const a of apps) {
    const svc = serviceOfAction(a.app)
    const g = (groups[svc ?? ''] ||= { service: svc, is_other: !svc || undefined, requests: 0, tokens: 0, [costKey]: 0, apps: [] })
    g.requests += a.requests || 0
    g.tokens += a.tokens || 0
    g[costKey] += a[costKey] || 0
    g.apps.push(a)
  }
  const rows = Object.values(groups)
    .sort((x, y) => (y[costKey] - x[costKey]) || (y.requests - x.requests))
  for (const g of rows) g.apps.sort((x, y) => (y[costKey] - x[costKey]) || (y.requests - x.requests))
  // „Ostalo" uvek na dno
  rows.sort((x, y) => (x.service === null) - (y.service === null))
  return rows
}

// Normalize a date range: default last 30 days; date-only `to` → end of day
// (critical for billing — the whole last day must be included, spec §7.0).
// Date-only granice se tumače kao dani u Europe/Belgrade (P1-8.7) — ranije je
// `new Date('YYYY-MM-DD')` davao ponoć u UTC-u pa je granica dana zavisila
// od zone servera.
export function normalizeRange(from, to) {
  const now = new Date()
  let fromD = from ? new Date(from) : new Date(now.getTime() - 30 * 86400000)
  let toD = to ? new Date(to) : now
  if (typeof from === 'string' && from.length <= 10) {
    fromD = startOfDayBelgrade(from) || fromD
  }
  if (typeof to === 'string' && to.length <= 10) {
    toD = endOfDayBelgrade(to) || toD
  }
  return { fromDate: fromD.toISOString(), toDate: toD.toISOString() }
}
