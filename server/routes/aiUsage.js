// AI token usage — live proxy routes (spec §7) + pricing/config admin (§7.10).
// View: admin + super_admin. Manage (key, pricing, sync): super_admin only.

import { Router } from 'express'
import db from '../db.js'
import { encryptToken, decryptToken } from '../jiraClient.js'
import {
  AdminApiNotConfiguredError, getAdminConfig, adminGet,
  getTenants, getUsageSummary, getServiceNames, getActions, getModels,
  buildIdentityMap, resolveTenant, normalizeRange,
} from '../aiUsage/adminApi.js'
import { getPricingConfig, makePriceResolver, groupCost, costModelGroups, syncAzurePrices } from '../aiUsage/pricing.js'
import { fetchTodaysRates, usdConversion } from '../aiUsage/fx.js'
import { listBudgetStatuses, budgetStatus, checkBudgets, currentMonthKey, listAlerts, BUDGET_SELECT } from '../aiUsage/budgets.js'
import { mailConfigured } from '../aiUsage/mailer.js'
import { buildReportData, buildXlsx, buildReportHtml } from '../aiUsage/report.js'
import { getRole, isAdminRole } from '../rbac.js'
import { logger } from '../logger.js'
import { logAudit } from '../audit.js'

const router = Router()
const MAX_APP_FILTERS = 40

const roleOf = getRole
const isAdmin = isAdminRole

function requireView(req, res) {
  if (!isAdmin(roleOf(req.userId))) { res.status(403).json({ error: 'Forbidden' }); return false }
  return true
}
function requireManage(req, res) {
  if (roleOf(req.userId) !== 'super_admin') { res.status(403).json({ error: 'Forbidden' }); return false }
  return true
}

// Degradation (§10): not configured → HTTP 200, empty data, flags set.
function handleErr(res, err, emptyPayload) {
  if (err instanceof AdminApiNotConfiguredError) {
    return res.json({ ...emptyPayload, not_configured: true, cost_basis: 'none' })
  }
  logger.error({ err }, '[ai-usage]')
  res.status(500).json({ error: 'Greška servera' })
}

// ── Dashboard KPI (§7.1) ──────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  if (!requireView(req, res)) return
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  const empty = { totals: null, active_clients: 0, today: null, unpriced_models: [] }
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const [byModel, byTenant, today, tenants] = await Promise.all([
      getUsageSummary({ fromDate, toDate, groupBy: 'Model' }),
      getUsageSummary({ fromDate, toDate, groupBy: 'Tenant' }),
      getUsageSummary({ fromDate: todayStart.toISOString(), toDate: new Date().toISOString(), groupBy: 'None' }),
      getTenants(),
    ])
    const identity = buildIdentityMap(tenants)
    const { totalCost, unpricedModels } = costModelGroups(byModel.groups)
    const activeKeys = new Set()
    for (const g of (byTenant.groups || [])) if ((g.requests || 0) > 0) activeKeys.add(resolveTenant(identity, g.tenantId).key)
    const t = byModel.totals || {}
    res.json({
      from: fromDate, to: toDate, cost_basis: 'exact', last_synced_at: null,
      totals: {
        requests: t.requests || 0,
        total_tokens: t.totalTokens || 0,
        prompt_tokens: t.promptTokens || 0,
        completion_tokens: t.completionTokens || 0,
        success_count: t.successCount || 0,
        error_count: Math.max(0, (t.requests || 0) - (t.successCount || 0)),
        avg_duration_ms: t.avgDurationMs || 0,
        total_cost_usd: (byModel.groups || []).length ? totalCost : null,
        avg_cost_per_req: (t.requests || 0) > 0 ? totalCost / t.requests : null,
      },
      today: {
        requests: today.totals?.requests || 0,
        total_tokens: today.totals?.totalTokens || 0,
      },
      active_clients: activeKeys.size,
      unpriced_models: unpricedModels,
    })
  } catch (err) { handleErr(res, err, empty) }
})

// ── Trends: daily series (§7.2) ───────────────────────────────────────────────
router.get('/trends', async (req, res) => {
  if (!requireView(req, res)) return
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  try {
    const data = await getUsageSummary({ fromDate, toDate, groupBy: 'ModelDay' })
    const resolve = makePriceResolver()
    const days = {}
    for (const g of (data.groups || [])) {
      const day = String(g.day || '').slice(0, 10)
      if (!day) continue
      const d = (days[day] ||= { date: day, requests: 0, tokens: 0, cost_usd: 0 })
      d.requests += g.requests || 0
      d.tokens += g.totalTokens || 0
      d.cost_usd += groupCost(resolve, g)
    }
    res.json({ cost_basis: 'exact', days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)) })
  } catch (err) { handleErr(res, err, { days: [] }) }
})

// ── Shared (company × source) cells for by-client / by-source (§7.3) ─────────
async function buildCells(fromDate, toDate) {
  const [data, tenants] = await Promise.all([
    getUsageSummary({ fromDate, toDate, groupBy: 'ModelTenant' }),
    getTenants(),
  ])
  const identity = buildIdentityMap(tenants)
  const resolve = makePriceResolver()
  const cells = {}
  for (const g of (data.groups || [])) {
    const who = resolveTenant(identity, g.tenantId)
    const cell = (cells[`${who.key}::${who.source}`] ||= { key: who.key, name: who.name, source: who.source, requests: 0, tokens: 0, cost_usd: 0 })
    cell.requests += g.requests || 0
    cell.tokens += g.totalTokens || 0
    cell.cost_usd += groupCost(resolve, g)
  }
  return Object.values(cells)
}
const bySort = (a, b) => b.cost_usd - a.cost_usd || b.requests - a.requests

router.get('/by-client', async (req, res) => {
  if (!requireView(req, res)) return
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  try {
    const cells = await buildCells(fromDate, toDate)
    const clients = {}
    for (const c of cells) {
      const row = (clients[c.key] ||= { key: c.key, name: c.name, requests: 0, tokens: 0, cost_usd: 0, sources: [] })
      row.requests += c.requests; row.tokens += c.tokens; row.cost_usd += c.cost_usd
      row.sources.push({ source: c.source, requests: c.requests, tokens: c.tokens, cost_usd: c.cost_usd })
    }
    const rows = Object.values(clients).sort(bySort)
    rows.forEach(r => r.sources.sort(bySort))
    res.json({ cost_basis: 'exact', clients: rows })
  } catch (err) { handleErr(res, err, { clients: [] }) }
})

router.get('/by-source', async (req, res) => {
  if (!requireView(req, res)) return
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  try {
    const cells = await buildCells(fromDate, toDate)
    const sources = {}
    for (const c of cells) {
      const row = (sources[c.source] ||= { source: c.source, requests: 0, tokens: 0, cost_usd: 0, clients: [] })
      row.requests += c.requests; row.tokens += c.tokens; row.cost_usd += c.cost_usd
      row.clients.push({ key: c.key, name: c.name, requests: c.requests, tokens: c.tokens, cost_usd: c.cost_usd })
    }
    const rows = Object.values(sources).sort(bySort)
    rows.forEach(r => r.clients.sort(bySort))
    res.json({ cost_basis: 'exact', sources: rows })
  } catch (err) { handleErr(res, err, { sources: [] }) }
})

// ── By app/action — fan-out, capped (§7.4) ────────────────────────────────────
// Fan-out po akcijama ne pokriva sve zahteve (limit od 40 akcija + upisi bez
// akcije), pa se razlika do ukupnog zbira prikazuje kao red „Ostalo"
// (is_other) — zbir tabele se uvek slaže sa KPI ukupnim brojevima.
function appendOtherRow(apps, totals, costKey) {
  const covered = apps.reduce((s, a) => ({ req: s.req + a.requests, tok: s.tok + a.tokens, cost: s.cost + (a[costKey] || 0) }), { req: 0, tok: 0, cost: 0 })
  const rest = (totals.requests || 0) - covered.req
  if (rest > 0) {
    apps.push({
      app: null, is_other: true, requests: rest,
      tokens: Math.max(0, (totals.tokens || 0) - covered.tok),
      [costKey]: Math.max(0, (totals.cost || 0) - covered.cost),
    })
  }
  return apps
}

router.get('/by-app', async (req, res) => {
  if (!requireView(req, res)) return
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  try {
    const [actions, overall] = await Promise.all([
      getActions(),
      getUsageSummary({ fromDate, toDate, groupBy: 'Model' }),
    ])
    const limited = (actions || []).slice(0, MAX_APP_FILTERS)
    const rows = await Promise.all(limited.map(action =>
      getUsageSummary({ fromDate, toDate, action, groupBy: 'Model' })
        .then(data => {
          const { totalCost } = costModelGroups(data.groups)
          const t = data.totals || {}
          return { app: action, requests: t.requests || 0, tokens: t.totalTokens || 0, cost_usd: totalCost }
        })
        .catch(() => null)
    ))
    const apps = rows.filter(r => r && r.requests > 0).sort(bySort)
    const ot = overall.totals || {}
    appendOtherRow(apps, { requests: ot.requests, tokens: ot.totalTokens, cost: costModelGroups(overall.groups).totalCost }, 'cost_usd')
    res.json({
      cost_basis: 'exact',
      truncated: (actions || []).length > MAX_APP_FILTERS,
      apps,
    })
  } catch (err) { handleErr(res, err, { apps: [], truncated: false }) }
})

// ── By model (§7.5) ───────────────────────────────────────────────────────────
router.get('/by-model', async (req, res) => {
  if (!requireView(req, res)) return
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  try {
    const data = await getUsageSummary({ fromDate, toDate, groupBy: 'Model' })
    const resolve = makePriceResolver()
    const rows = (data.groups || []).filter(g => g.modelName).map(g => ({
      model: g.modelName,
      requests: g.requests || 0,
      prompt_tokens: g.promptTokens || 0,
      completion_tokens: g.completionTokens || 0,
      tokens: g.totalTokens || 0,
      cost_usd: groupCost(resolve, g),
      priced: resolve(g.modelName).priced,
    })).sort(bySort)
    res.json({ cost_basis: 'exact', models: rows, unpriced_models: rows.filter(r => !r.priced).map(r => String(r.model).toLowerCase()) })
  } catch (err) { handleErr(res, err, { models: [], unpriced_models: [] }) }
})

// ── Tenants dropdown (§7.6) ───────────────────────────────────────────────────
router.get('/tenants', async (req, res) => {
  if (!requireView(req, res)) return
  try {
    const tenants = await getTenants()
    // Only tenants we actually work with, unless ?all=1
    const untracked = new Set(
      db.prepare('SELECT tenant_id FROM client_tenant_mappings WHERE is_tracked = 0').all().map(r => String(r.tenant_id).toLowerCase())
    )
    const all = String(req.query.all || '') === '1'
    res.json({
      tracked_filter: !all,
      untracked_count: untracked.size,
      tenants: (tenants || [])
        .filter(t => all || !untracked.has(String(t.tenantGuid || '').toLowerCase()))
        .map(t => ({ tenant_guid: t.tenantGuid, name: t.name, code: t.eProcurementTenantCode || null }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    })
  } catch (err) { handleErr(res, err, { tenants: [] }) }
})

// ── Tenant report (§7.7) — per-customer, currency-converted ──────────────────
router.get('/tenant-report', async (req, res) => {
  if (!requireView(req, res)) return
  const { tenantGuid, currency = 'USD' } = req.query
  if (!tenantGuid) return res.status(400).json({ error: 'tenantGuid je obavezan' })
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  try {
    const tenants = await getTenants()
    const wanted = String(tenantGuid).toLowerCase()
    const tenant = (tenants || []).find(t =>
      String(t.tenantGuid || '').toLowerCase() === wanted || String(t.eProcurementTenantGuid || '').toLowerCase() === wanted)
    const guids = tenant
      ? [
          { guid: tenant.tenantGuid, source: 'SalesLeader' },
          ...(tenant.eProcurementTenantGuid ? [{ guid: tenant.eProcurementTenantGuid, source: 'eProcurement' }] : []),
        ]
      : [{ guid: tenantGuid, source: 'unknown' }]

    const conv = usdConversion(currency, toDate)
    const resolve = makePriceResolver()

    // Per model — merge across both GUIDs
    const modelSummaries = await Promise.all(guids.map(g =>
      getUsageSummary({ fromDate, toDate, tenantId: g.guid, groupBy: 'Model' }).catch(() => null)))
    const models = {}
    const sourceRows = []
    modelSummaries.forEach((data, i) => {
      if (!data) return
      const t = data.totals || {}
      let srcCost = 0
      for (const g of (data.groups || [])) {
        if (!g.modelName) continue
        const m = (models[String(g.modelName).toLowerCase()] ||= { model: g.modelName, requests: 0, prompt_tokens: 0, completion_tokens: 0, tokens: 0, cost: 0 })
        m.requests += g.requests || 0
        m.prompt_tokens += g.promptTokens || 0
        m.completion_tokens += g.completionTokens || 0
        m.tokens += g.totalTokens || 0
        const c = groupCost(resolve, g)
        m.cost += c * conv.factor
        srcCost += c
      }
      sourceRows.push({ source: guids[i].source, requests: t.requests || 0, tokens: t.totalTokens || 0, cost: srcCost * conv.factor })
    })

    // Per app — fan-out actions × GUIDs (cap 40)
    const actions = await getActions().catch(() => [])
    const limited = (actions || []).slice(0, MAX_APP_FILTERS)
    const appCells = await Promise.all(limited.flatMap(action => guids.map(g =>
      getUsageSummary({ fromDate, toDate, tenantId: g.guid, action, groupBy: 'Model' })
        .then(d => ({ action, d })).catch(() => null))))
    const apps = {}
    for (const cell of appCells) {
      if (!cell?.d) continue
      const t = cell.d.totals || {}
      if (!(t.requests > 0)) continue
      const a = (apps[cell.action] ||= { app: cell.action, requests: 0, tokens: 0, cost: 0 })
      a.requests += t.requests || 0
      a.tokens += t.totalTokens || 0
      a.cost += costModelGroups(cell.d.groups).totalCost * conv.factor
    }

    const modelRows = Object.values(models).sort((a, b) => b.cost - a.cost)
    const totals = {
      requests: sourceRows.reduce((s, r) => s + r.requests, 0),
      tokens: sourceRows.reduce((s, r) => s + r.tokens, 0),
      cost: modelRows.reduce((s, r) => s + r.cost, 0),
    }
    const appRows = Object.values(apps).sort((a, b) => b.cost - a.cost)
    appendOtherRow(appRows, totals, 'cost')
    res.json({
      cost_basis: 'exact',
      customer: { tenant_guid: tenant?.tenantGuid || tenantGuid, name: tenant?.name || tenantGuid, code: tenant?.eProcurementTenantCode || null },
      period: { from: fromDate, to: toDate },
      currency: conv.currency,
      rate_available: conv.rateAvailable,
      rate_stale: conv.rateStale || false,
      rate_age_days: conv.rateAgeDays ?? null,
      models: modelRows,
      bySource: sourceRows.sort((a, b) => b.cost - a.cost),
      byApp: appRows,
      totals,
    })
  } catch (err) { handleErr(res, err, { models: [], bySource: [], byApp: [], totals: null }) }
})

// ── Filter options (§7.8) ─────────────────────────────────────────────────────
router.get('/filter-options', async (req, res) => {
  if (!requireView(req, res)) return
  try {
    const [models, actions, services] = await Promise.all([
      getModels().catch(() => []), getActions().catch(() => []), getServiceNames().catch(() => []),
    ])
    res.json({ models, actions, services })
  } catch (err) { handleErr(res, err, { models: [], actions: [], services: [] }) }
})

// ── Admin: API config + master key (§9) ──────────────────────────────────────
router.get('/admin/config', (req, res) => {
  if (!requireManage(req, res)) return
  const cfg = getAdminConfig()
  const pricing = getPricingConfig()
  res.json({
    base_url: cfg?.base_url || '',
    is_active: !!cfg?.is_active,
    has_password: !!cfg?.service_password_enc,
    last_test_ok: cfg?.last_test_ok == null ? null : !!cfg.last_test_ok,
    last_test_message: cfg?.last_test_message || null,
    last_tested_at: cfg?.last_tested_at || null,
    pricing: {
      global_markup_pct: pricing?.global_markup_pct ?? 20,
      pricing_source_url: pricing?.pricing_source_url,
      last_synced_at: pricing?.last_synced_at, last_sync_ok: pricing?.last_sync_ok == null ? null : !!pricing.last_sync_ok,
      last_sync_message: pricing?.last_sync_message,
    },
  })
})

router.put('/admin/config', (req, res) => {
  if (!requireManage(req, res)) return
  const { base_url, is_active, service_password } = req.body
  const enc = service_password?.trim() ? encryptToken(service_password.trim()) : null
  db.prepare(`
    UPDATE integration_api_configs SET
      base_url = COALESCE(?, base_url),
      is_active = COALESCE(?, is_active),
      service_password_enc = COALESCE(?, service_password_enc),
      updated_at = CURRENT_TIMESTAMP
    WHERE service_key = 'agentic_admin'
  `).run(base_url?.trim() || null, is_active === undefined ? null : (is_active ? 1 : 0), enc)
  logAudit(req.userId, 'aiusage.config.update', `base_url: ${base_url?.trim() || '-'}, aktivno: ${is_active ?? '-'}${enc ? ', ključ promenjen' : ''}`, req)
  res.json({ ok: true })
})

router.post('/admin/test', async (req, res) => {
  if (!requireManage(req, res)) return
  try {
    const cfg = getAdminConfig()
    const key = req.body?.service_password?.trim() || (cfg?.service_password_enc ? decryptToken(cfg.service_password_enc) : null)
    const baseUrl = (req.body?.base_url || cfg?.base_url || '').replace(/\/$/, '')
    if (!baseUrl || !key) return res.status(400).json({ ok: false, message: 'Nedostaje URL ili ključ' })
    const tenants = await adminGet('/api/admin/tenants', {}, { baseUrl, key })
    const msg = `Connected — ${(tenants || []).length} tenants`
    db.prepare("UPDATE integration_api_configs SET last_tested_at = CURRENT_TIMESTAMP, last_test_ok = 1, last_test_message = ? WHERE service_key = 'agentic_admin'").run(msg)
    res.json({ ok: true, message: msg })
  } catch (err) {
    const msg = String(err.message || err).slice(0, 490)
    db.prepare("UPDATE integration_api_configs SET last_tested_at = CURRENT_TIMESTAMP, last_test_ok = 0, last_test_message = ? WHERE service_key = 'agentic_admin'").run(msg)
    res.json({ ok: false, message: msg })
  }
})

// ── Admin: probe — sirovi odgovor Agentic Admin API-ja (samo super_admin) ────
// Dijagnostika: kad treba videti šta API tačno vraća (npr. za alate koji ne
// upisuju model). GET-only, dozvoljene su samo poznate putanje i parametri.
const PROBE_PATHS = [
  '/api/admin/tenants',
  '/api/admin/usage/ai/summary',
  '/api/admin/usage/ai/service-names',
  '/api/admin/usage/ai/actions',
  '/api/admin/usage/ai/models',
]
const PROBE_PARAMS = ['groupBy', 'tenantId', 'action', 'serviceName', 'model']

router.get('/admin/probe', async (req, res) => {
  if (!requireManage(req, res)) return
  const path = String(req.query.path || '')
  if (!PROBE_PATHS.includes(path)) return res.status(400).json({ error: 'Nepoznata putanja', allowed: PROBE_PATHS })
  const params = {}
  if (req.query.from || req.query.to) {
    const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
    params.fromDate = fromDate
    params.toDate = toDate
  }
  for (const k of PROBE_PARAMS) if (req.query[k]) params[k] = String(req.query[k]).slice(0, 200)
  try {
    const data = await adminGet(path, params)
    logAudit(req.userId, 'aiusage.probe', `${path} ${JSON.stringify(params)}`.slice(0, 300), req)
    res.json({ path, params, data })
  } catch (err) {
    if (err instanceof AdminApiNotConfiguredError) return res.status(400).json({ error: 'Admin API nije konfigurisan' })
    // Dijagnostički alat za super_admina — poruka Admin API-ja je ovde poenta
    // (isto kao /admin/test), pa se ne skriva iza generičke greške.
    res.status(502).json({ error: String(err.message || err).slice(0, 300) })
  }
})

// ── Admin: pricing (§7.10) ────────────────────────────────────────────────────
router.put('/admin/pricing-config', (req, res) => {
  if (!requireManage(req, res)) return
  const { global_markup_pct, pricing_source_url } = req.body
  db.prepare('UPDATE ai_pricing_config SET global_markup_pct = COALESCE(?, global_markup_pct), pricing_source_url = COALESCE(?, pricing_source_url), updated_at = CURRENT_TIMESTAMP WHERE id = 1')
    .run(global_markup_pct == null ? null : Number(global_markup_pct), pricing_source_url?.trim() || null)
  logAudit(req.userId, 'aiusage.pricing.update', `globalna marža: ${global_markup_pct ?? '-'}%`, req)
  res.json({ ok: true })
})

router.get('/admin/models', (req, res) => {
  if (!requireView(req, res)) return
  const global = getPricingConfig()?.global_markup_pct || 0
  const rows = db.prepare('SELECT * FROM ai_model_pricing ORDER BY model_name ASC').all().map(m => ({
    ...m,
    is_active: !!m.is_active,
    final_input_per_1m: Math.round(m.input_price_per_1m * (1 + (global + m.model_markup_pct) / 100) * 1e6) / 1e6,
    final_output_per_1m: Math.round(m.output_price_per_1m * (1 + (global + m.model_markup_pct) / 100) * 1e6) / 1e6,
  }))
  res.json({ global_markup_pct: global, models: rows })
})

function auditPriceChange(name, prev, inP, outP, changedBy) {
  const changed = !prev || Math.abs((prev.input_price_per_1m || 0) - inP) > 1e-9 || Math.abs((prev.output_price_per_1m || 0) - outP) > 1e-9
  if (changed) {
    db.prepare(`INSERT INTO ai_model_pricing_history (model_name, old_input_per_1m, new_input_per_1m, old_output_per_1m, new_output_per_1m, source, changed_by) VALUES (?, ?, ?, ?, ?, 'manual', ?)`)
      .run(name, prev ? prev.input_price_per_1m : null, inP, prev ? prev.output_price_per_1m : null, outP, changedBy)
  }
}

router.put('/admin/models/:modelName', (req, res) => {
  if (!requireManage(req, res)) return
  const name = String(req.params.modelName).toLowerCase().trim()
  const { input_price_per_1m, output_price_per_1m, model_markup_pct, is_active } = req.body
  const prev = db.prepare('SELECT * FROM ai_model_pricing WHERE model_name = ?').get(name)
  const changedBy = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId)?.email || 'unknown'
  const priceChanged = input_price_per_1m != null || output_price_per_1m != null
  if (!prev) {
    const inP = Number(input_price_per_1m) || 0, outP = Number(output_price_per_1m) || 0
    db.prepare(`INSERT INTO ai_model_pricing (model_name, input_price_per_1m, output_price_per_1m, model_markup_pct, source, is_active, updated_at) VALUES (?, ?, ?, ?, 'manual', 1, CURRENT_TIMESTAMP)`)
      .run(name, inP, outP, Number(model_markup_pct) || 0)
    auditPriceChange(name, null, inP, outP, changedBy)
  } else {
    const inP = input_price_per_1m != null ? Number(input_price_per_1m) : prev.input_price_per_1m
    const outP = output_price_per_1m != null ? Number(output_price_per_1m) : prev.output_price_per_1m
    db.prepare(`
      UPDATE ai_model_pricing SET input_price_per_1m = ?, output_price_per_1m = ?,
        model_markup_pct = COALESCE(?, model_markup_pct),
        is_active = COALESCE(?, is_active),
        source = CASE WHEN ? THEN 'manual' ELSE source END,
        updated_at = CURRENT_TIMESTAMP
      WHERE model_name = ?
    `).run(inP, outP, model_markup_pct == null ? null : Number(model_markup_pct), is_active === undefined ? null : (is_active ? 1 : 0), priceChanged ? 1 : 0, name)
    if (priceChanged) auditPriceChange(name, prev, inP, outP, changedBy)
  }
  logAudit(req.userId, 'aiusage.model.update', `model ${name}${priceChanged ? ' — cena promenjena' : ''}`, req)
  res.json({ ok: true })
})

router.get('/admin/history', (req, res) => {
  if (!requireView(req, res)) return
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100))
  const model = req.query.model?.trim()
  const rows = model
    ? db.prepare('SELECT * FROM ai_model_pricing_history WHERE model_name = ? ORDER BY changed_at DESC LIMIT ?').all(model.toLowerCase(), limit)
    : db.prepare('SELECT * FROM ai_model_pricing_history ORDER BY changed_at DESC LIMIT ?').all(limit)
  res.json({ history: rows })
})

router.post('/admin/sync', async (req, res) => {
  if (!requireManage(req, res)) return
  try {
    const email = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId)?.email || 'sync'
    res.json(await syncAzurePrices(email))
  } catch (err) { { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) } }
})

router.post('/admin/fx-fetch', async (req, res) => {
  if (!requireManage(req, res)) return
  try { res.json({ results: await fetchTodaysRates() }) }
  catch (err) { { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) } }
})

// ── Tenant ↔ client mapping (Faza 3) ─────────────────────────────────────────

router.get('/admin/mappings', (req, res) => {
  if (!requireManage(req, res)) return
  const rows = db.prepare('SELECT * FROM client_tenant_mappings ORDER BY tenant_name ASC').all()
  const links = db.prepare(`
    SELECT ctu.tenant_id, u.id, u.name, u.email
    FROM client_tenant_users ctu JOIN users u ON u.id = ctu.user_id
  `).all()
  const byTenant = {}
  for (const l of links) (byTenant[l.tenant_id] ||= []).push({ id: l.id, name: l.name, email: l.email })
  const mappings = rows.map(m => ({ ...m, is_tracked: m.is_tracked == null ? true : !!m.is_tracked, users: byTenant[m.tenant_id] || [] }))
  const clients = db.prepare("SELECT id, name, email FROM users WHERE role = 'user' ORDER BY name ASC").all()
  res.json({ mappings, clients })
})

// Discover: pull tenants from the Admin API and upsert (manual links preserved)
router.post('/admin/mappings/discover', async (req, res) => {
  if (!requireManage(req, res)) return
  try {
    const tenants = await getTenants()
    const up = db.prepare(`
      INSERT INTO client_tenant_mappings (tenant_id, tenant_name, tenant_code, sl_tenant_guid, eproc_tenant_guid, is_active, auto_discovered, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (tenant_id) DO UPDATE SET
        tenant_name = excluded.tenant_name,
        tenant_code = excluded.tenant_code,
        sl_tenant_guid = excluded.sl_tenant_guid,
        eproc_tenant_guid = COALESCE(client_tenant_mappings.eproc_tenant_guid, excluded.eproc_tenant_guid),
        is_active = excluded.is_active,
        auto_discovered = 1, updated_at = CURRENT_TIMESTAMP
    `)
    let n = 0
    for (const t of (tenants || [])) {
      if (!t.tenantGuid) continue
      up.run(t.tenantGuid, t.name || null, t.eProcurementTenantCode || null, t.tenantGuid, t.eProcurementTenantGuid || null, t.enabled ? 1 : 0)
      n++
    }
    res.json({ ok: true, discovered: n })
  } catch (err) {
    if (err instanceof AdminApiNotConfiguredError) return res.status(400).json({ error: 'Admin API nije konfigurisan' })
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

router.put('/admin/mappings/:tenantId', (req, res) => {
  if (!requireManage(req, res)) return
  const tenantId = req.params.tenantId
  const { client_user_ids, is_tracked } = req.body || {}

  // Tracked flag alone (manual "we work with this one" switch)
  if (is_tracked !== undefined) {
    db.prepare('UPDATE client_tenant_mappings SET is_tracked = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?')
      .run(is_tracked ? 1 : 0, tenantId)
  }
  // Replace the tenant's user set (many-to-many)
  if (Array.isArray(client_user_ids)) {
    const ids = client_user_ids.map(Number).filter(Number.isFinite)
    db.transaction(() => {
      db.prepare('DELETE FROM client_tenant_users WHERE tenant_id = ?').run(tenantId)
      const ins = db.prepare('INSERT OR IGNORE INTO client_tenant_users (tenant_id, user_id) VALUES (?, ?)')
      for (const id of ids) ins.run(tenantId, id)
      db.prepare('UPDATE client_tenant_mappings SET updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?').run(tenantId)
    })()
  }
  logAudit(req.userId, 'aiusage.mapping.update', `tenant ${tenantId}${is_tracked !== undefined ? `, praćen: ${is_tracked ? 'da' : 'ne'}` : ''}${Array.isArray(client_user_ids) ? `, korisnici: [${client_user_ids.join(',')}]` : ''}`, req)
  res.json({ ok: true })
})

// ── In-app budget notes ───────────────────────────────────────────────────────
router.get('/alerts', (req, res) => {
  res.json({ alerts: listAlerts(req.userId, isAdmin(roleOf(req.userId))) })
})

router.post('/alerts/:id/ack', (req, res) => {
  if (!requireView(req, res)) return
  db.prepare('UPDATE ai_usage_alerts SET acked_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── Client-facing usage (Faza 3): the logged-in client's own consumption ─────
router.get('/my', async (req, res) => {
  const { currency = 'USD' } = req.query
  const { fromDate, toDate } = normalizeRange(req.query.from, req.query.to)
  const empty = { totals: null, models: [], byApp: [], days: [] }
  try {
    const mappings = db.prepare(`
      SELECT m.* FROM client_tenant_mappings m
      JOIN client_tenant_users ctu ON ctu.tenant_id = m.tenant_id
      WHERE ctu.user_id = ? AND m.is_active = 1
    `).all(req.userId)
    if (!mappings.length) return res.json({ ...empty, not_mapped: true })

    const guids = []
    for (const m of mappings) {
      if (m.sl_tenant_guid) guids.push(m.sl_tenant_guid)
      if (m.eproc_tenant_guid) guids.push(m.eproc_tenant_guid)
    }
    const conv = usdConversion(currency, toDate)
    const resolve = makePriceResolver()

    // Per model + daily trend, merged across the client's GUIDs
    const [modelSums, daySums] = await Promise.all([
      Promise.all(guids.map(g => getUsageSummary({ fromDate, toDate, tenantId: g, groupBy: 'Model' }).catch(() => null))),
      Promise.all(guids.map(g => getUsageSummary({ fromDate, toDate, tenantId: g, groupBy: 'ModelDay' }).catch(() => null))),
    ])

    const models = {}
    let requests = 0, tokens = 0
    for (const data of modelSums) {
      if (!data) continue
      requests += data.totals?.requests || 0
      tokens += data.totals?.totalTokens || 0
      for (const g of (data.groups || [])) {
        if (!g.modelName) continue
        const m = (models[String(g.modelName).toLowerCase()] ||= { model: g.modelName, requests: 0, tokens: 0, cost: 0 })
        m.requests += g.requests || 0
        m.tokens += g.totalTokens || 0
        m.cost += groupCost(resolve, g) * conv.factor
      }
    }

    const days = {}
    for (const data of daySums) {
      if (!data) continue
      for (const g of (data.groups || [])) {
        const day = String(g.day || '').slice(0, 10)
        if (!day) continue
        const d = (days[day] ||= { date: day, requests: 0, tokens: 0, cost: 0 })
        d.requests += g.requests || 0
        d.tokens += g.totalTokens || 0
        d.cost += groupCost(resolve, g) * conv.factor
      }
    }

    // Per app — fan-out actions × GUIDs (cap 40)
    const actions = await getActions().catch(() => [])
    const appCells = await Promise.all((actions || []).slice(0, MAX_APP_FILTERS).flatMap(action => guids.map(g =>
      getUsageSummary({ fromDate, toDate, tenantId: g, action, groupBy: 'Model' })
        .then(d => ({ action, d })).catch(() => null))))
    const apps = {}
    for (const cell of appCells) {
      if (!cell?.d || !(cell.d.totals?.requests > 0)) continue
      const a = (apps[cell.action] ||= { app: cell.action, requests: 0, tokens: 0, cost: 0 })
      a.requests += cell.d.totals.requests || 0
      a.tokens += cell.d.totals.totalTokens || 0
      a.cost += costModelGroups(cell.d.groups).totalCost * conv.factor
    }

    const modelRows = Object.values(models).sort((a, b) => b.cost - a.cost)
    const totals = { requests, tokens, cost: modelRows.reduce((s, r) => s + r.cost, 0) }
    const appRows = Object.values(apps).sort((a, b) => b.cost - a.cost)
    appendOtherRow(appRows, totals, 'cost')
    res.json({
      cost_basis: 'exact',
      customer: { name: mappings[0].tenant_name || 'Vaša organizacija' },
      period: { from: fromDate, to: toDate },
      currency: conv.currency,
      rate_available: conv.rateAvailable,
      rate_stale: conv.rateStale || false,
      rate_age_days: conv.rateAgeDays ?? null,
      totals,
      models: modelRows,
      byApp: appRows,
      days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    })
  } catch (err) { handleErr(res, err, empty) }
})

// ── Budgets: monthly EUR limit + early warning per tenant ────────────────────

router.get('/budgets', async (req, res) => {
  if (!requireView(req, res)) return
  const rows = db.prepare(`
    SELECT m.tenant_id, m.tenant_name, m.tenant_code, m.is_active,
           b.monthly_limit_eur, b.warning_pct, b.notify_enabled, b.extra_emails,
           b.warning_sent_month, b.limit_sent_month, b.package_id,
           p.name AS package_name, p.monthly_fee_eur AS package_fee_eur, p.included_eur AS package_included_eur
    FROM client_tenant_mappings m
    LEFT JOIN tenant_budgets b ON b.tenant_id = m.tenant_id
    LEFT JOIN ai_packages p ON p.id = b.package_id
    WHERE COALESCE(m.is_tracked, 1) = 1
    ORDER BY m.tenant_name ASC
  `).all()
  let statuses = []
  try { statuses = await listBudgetStatuses() } catch { /* Admin API down → no live spend */ }
  const byId = Object.fromEntries(statuses.map(s => [s.tenant_id, s]))
  res.json({
    month: currentMonthKey(),
    mail_configured: mailConfigured(),
    budgets: rows.map(r => ({
      ...r,
      notify_enabled: r.notify_enabled == null ? true : !!r.notify_enabled,
      warning_pct: r.warning_pct ?? 80,
      status: byId[r.tenant_id] || null,
    })),
  })
})

router.put('/budgets/:tenantId', (req, res) => {
  if (!requireManage(req, res)) return
  const { monthly_limit_eur, warning_pct, notify_enabled, extra_emails, package_id } = req.body
  const limit = monthly_limit_eur === '' || monthly_limit_eur == null ? null : Number(monthly_limit_eur)
  const pkg = package_id === '' || package_id == null ? null : Number(package_id)
  db.prepare(`
    INSERT INTO tenant_budgets (tenant_id, monthly_limit_eur, warning_pct, notify_enabled, extra_emails, package_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (tenant_id) DO UPDATE SET
      monthly_limit_eur = excluded.monthly_limit_eur,
      warning_pct = excluded.warning_pct,
      notify_enabled = excluded.notify_enabled,
      extra_emails = excluded.extra_emails,
      package_id = excluded.package_id,
      updated_at = CURRENT_TIMESTAMP
  `).run(req.params.tenantId, limit, Number(warning_pct) || 80, notify_enabled === false ? 0 : 1, extra_emails?.trim() || null, pkg)
  logAudit(req.userId, 'aiusage.budget.update', `tenant ${req.params.tenantId}, limit: ${limit ?? '-'} EUR, paket: ${pkg ?? '-'}`, req)
  res.json({ ok: true })
})

// ── AI packages (tiers): fixed access fee + included consumption ──────────────

router.get('/packages', (req, res) => {
  if (!requireView(req, res)) return
  res.json({ packages: db.prepare('SELECT * FROM ai_packages ORDER BY sort_order, monthly_fee_eur, id').all() })
})

router.post('/admin/packages', (req, res) => {
  if (!requireManage(req, res)) return
  const { name, monthly_fee_eur, included_eur, description, sort_order, is_active } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Naziv paketa je obavezan' })
  const info = db.prepare(`
    INSERT INTO ai_packages (name, monthly_fee_eur, included_eur, description, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name.trim(), Number(monthly_fee_eur) || 0, Number(included_eur) || 0,
    description?.trim() || null, Number(sort_order) || 0, is_active === false ? 0 : 1)
  logAudit(req.userId, 'aiusage.package.create', `paket "${name.trim()}" (${Number(monthly_fee_eur) || 0} EUR / ${Number(included_eur) || 0} EUR)`, req)
  res.json({ ok: true, id: info.lastInsertRowid })
})

router.put('/admin/packages/:id', (req, res) => {
  if (!requireManage(req, res)) return
  const { name, monthly_fee_eur, included_eur, description, sort_order, is_active } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Naziv paketa je obavezan' })
  db.prepare(`
    UPDATE ai_packages SET name = ?, monthly_fee_eur = ?, included_eur = ?, description = ?, sort_order = ?, is_active = ?
    WHERE id = ?
  `).run(name.trim(), Number(monthly_fee_eur) || 0, Number(included_eur) || 0,
    description?.trim() || null, Number(sort_order) || 0, is_active === false ? 0 : 1, req.params.id)
  logAudit(req.userId, 'aiusage.package.update', `paket ${req.params.id} ("${name.trim()}")`, req)
  res.json({ ok: true })
})

router.delete('/admin/packages/:id', (req, res) => {
  if (!requireManage(req, res)) return
  db.prepare('UPDATE tenant_budgets SET package_id = NULL WHERE package_id = ?').run(req.params.id)
  db.prepare('DELETE FROM ai_packages WHERE id = ?').run(req.params.id)
  logAudit(req.userId, 'aiusage.package.delete', `paket ${req.params.id}`, req)
  res.json({ ok: true })
})

router.post('/budgets/check', async (req, res) => {
  if (!requireManage(req, res)) return
  try { res.json(await checkBudgets()) }
  catch (err) { { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) } }
})

// Client-facing: own budget status (first mapped tenant that has a limit)
router.get('/my-budget', async (req, res) => {
  try {
    const rows = db.prepare(`
      ${BUDGET_SELECT}
      JOIN client_tenant_users ctu ON ctu.tenant_id = b.tenant_id
      WHERE ctu.user_id = ?
    `).all(req.userId)
    const withLimit = rows.find(r => Number(r.monthly_limit_eur) > 0 || r.package_name)
    if (!withLimit) return res.json({ has_budget: false })
    res.json({ has_budget: true, ...(await budgetStatus(withLimit)) })
  } catch (err) { handleErr(res, err, { has_budget: false }) }
})

// ── Full report: chart-rich Excel + print-ready HTML/PDF ──────────────────────
// Audience follows the role: admins get every client + the pricelist,
// clients get only their own data with final prices (no markups).

const reportName = (d, ext) => {
  const slug = String(d.scopeName || 'ai').toLowerCase()
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `ai-potrosnja-${slug}-${d.period.from}_${d.period.to}.${ext}`
}

async function loadReport(req) {
  const admin = isAdmin(roleOf(req.userId))
  return buildReportData({
    from: req.query.from,
    to: req.query.to,
    currency: String(req.query.currency || 'EUR').toUpperCase(),
    userId: req.userId,
    isAdminUser: admin,
  })
}

router.get('/export/xlsx', async (req, res) => {
  try {
    const data = await loadReport(req)
    if (data.error) return res.status(400).json({ error: data.error })
    const wb = await buildXlsx(data)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${reportName(data, 'xlsx')}"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    if (err instanceof AdminApiNotConfiguredError) return res.status(400).json({ error: 'Admin API nije konfigurisan' })
    console.error('[ai-usage xlsx]', err)
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

router.get('/export/html', async (req, res) => {
  try {
    const data = await loadReport(req)
    if (data.error) return res.status(400).json({ error: data.error })
    const html = buildReportHtml(data)
    if (String(req.query.download || '') === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${reportName(data, 'html')}"`)
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    if (err instanceof AdminApiNotConfiguredError) return res.status(400).json({ error: 'Admin API nije konfigurisan' })
    console.error('[ai-usage html]', err)
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

export default router
