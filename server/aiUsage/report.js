// Full AI usage report: data collection (with previous-period comparison and
// end-of-month projection), a chart-rich .xlsx and a print-ready HTML/PDF.
// Two audiences:
//   internal → every client, pricelist, cross-client comparison
//   client   → only their own tenants, final prices only (no markups/pricelist)

import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db.js'
import { getUsageSummary, getActions, getTenants, buildIdentityMap, resolveTenant, normalizeRange } from './adminApi.js'
import { makePriceResolver, groupCost, costModelGroups, getPricingConfig } from './pricing.js'
import { usdConversion } from './fx.js'
import { budgetStatus, BUDGET_SELECT } from './budgets.js'
import { donut, trend, hbars, compareBars, gauge, P, SERIES } from './reportCharts.js'
import { renderSvgToPng } from '../svgWorker.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONT_FILES = [
  path.join(__dirname, '..', 'excel', 'fonts', 'HankenGrotesk-Regular.ttf'),
  path.join(__dirname, '..', 'excel', 'fonts', 'HankenGrotesk-SemiBold.ttf'),
  path.join(__dirname, '..', 'excel', 'fonts', 'HankenGrotesk-Bold.ttf'),
  path.join(__dirname, '..', 'excel', 'fonts', 'HankenGrotesk-ExtraBold.ttf'),
]
// Isti limit kao u rutama (routes/aiUsage.js): akcija je prešlo 40, pa je cap
// podignut da izveštaj pokrije sve; višak preko limita ulazi u red „Ostalo".
const MAX_APPS = 80
const FANOUT_CONCURRENCY = 8

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

// Rasterizacija u worker threadu (P2-B5) — ne blokira event loop.
const svgToPng = svg => renderSvgToPng(svg, FONT_FILES)

// ── formatting ────────────────────────────────────────────────────────────────
export const money = (v, cur) => {
  const n = Number(v) || 0
  const s = n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(4)
  return cur === 'USD' ? '$' + s : cur === 'EUR' ? s + ' €' : s + ' ' + cur
}
export const tok = n => {
  const v = Number(n) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
  return String(Math.round(v))
}
const num = n => (Number(n) || 0).toLocaleString('sr-RS')
const day10 = s => String(s || '').slice(0, 10)
const pctDelta = (now, prev) => (prev > 0 ? ((now - prev) / prev) * 100 : (now > 0 ? 100 : 0))

// ── collection ────────────────────────────────────────────────────────────────

// One scope = either everything (guids = null) or a specific tenant GUID set.
async function collect(guids, fromDate, toDate, { withApps = true } = {}) {
  const resolve = makePriceResolver()
  const call = params => getUsageSummary({ fromDate, toDate, ...params }).catch(() => null)
  const targets = guids && guids.length ? guids : [null]

  const [modelRes, dayRes, cellRes] = await Promise.all([
    Promise.all(targets.map(g => call({ groupBy: 'Model', ...(g ? { tenantId: g } : {}) }))),
    Promise.all(targets.map(g => call({ groupBy: 'ModelDay', ...(g ? { tenantId: g } : {}) }))),
    guids ? Promise.resolve([]) : Promise.all([call({ groupBy: 'ModelTenant' })]),
  ])

  const totals = { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, success: 0, cost: 0, durSum: 0, durN: 0 }
  const models = {}
  const perGuid = []
  modelRes.forEach((data, i) => {
    if (!data) return
    const t = data.totals || {}
    totals.requests += t.requests || 0
    totals.tokens += t.totalTokens || 0
    totals.promptTokens += t.promptTokens || 0
    totals.completionTokens += t.completionTokens || 0
    totals.success += t.successCount || 0
    if (t.avgDurationMs) { totals.durSum += t.avgDurationMs * (t.requests || 1); totals.durN += (t.requests || 1) }
    let gCost = 0
    for (const g of (data.groups || [])) {
      if (!g.modelName) continue
      const key = String(g.modelName).toLowerCase()
      const m = (models[key] ||= { model: g.modelName, requests: 0, promptTokens: 0, completionTokens: 0, tokens: 0, cost: 0, priced: resolve(g.modelName).priced })
      const c = groupCost(resolve, g)
      m.requests += g.requests || 0
      m.promptTokens += g.promptTokens || 0
      m.completionTokens += g.completionTokens || 0
      m.tokens += g.totalTokens || 0
      m.cost += c
      gCost += c
    }
    totals.cost += gCost
    perGuid.push({ guid: targets[i], requests: t.requests || 0, tokens: t.totalTokens || 0, cost: gCost })
  })

  const days = {}
  const dayModel = []
  for (const data of dayRes) {
    if (!data) continue
    for (const g of (data.groups || [])) {
      const d = day10(g.day)
      if (!d) continue
      const row = (days[d] ||= { date: d, requests: 0, tokens: 0, cost: 0 })
      const c = groupCost(resolve, g)
      row.requests += g.requests || 0
      row.tokens += g.totalTokens || 0
      row.cost += c
      dayModel.push({ date: d, model: g.modelName || '—', requests: g.requests || 0, promptTokens: g.promptTokens || 0, completionTokens: g.completionTokens || 0, cost: c })
    }
  }

  let apps = []
  if (withApps) {
    const actions = await getActions().catch(() => [])
    const jobs = (actions || []).slice(0, MAX_APPS).flatMap(action => targets.map(g => ({ action, guid: g })))
    const cells = await mapLimit(jobs, FANOUT_CONCURRENCY, job =>
      call({ action: job.action, groupBy: 'Model', ...(job.guid ? { tenantId: job.guid } : {}) }).then(d => ({ action: job.action, d })))
    const acc = {}
    for (const c of cells) {
      if (!c?.d || !(c.d.totals?.requests > 0)) continue
      const a = (acc[c.action] ||= { app: c.action, requests: 0, tokens: 0, cost: 0 })
      a.requests += c.d.totals.requests || 0
      a.tokens += c.d.totals.totalTokens || 0
      a.cost += costModelGroups(c.d.groups).totalCost
    }
    apps = Object.values(acc).sort((a, b) => b.cost - a.cost)
    // Red „Ostalo": zahtevi koje fan-out nije pokrio (akcije preko limita ili
    // upisi bez akcije) — zbir tabele se slaže sa ukupnim brojevima.
    const covered = apps.reduce((s, a) => ({ req: s.req + a.requests, tok: s.tok + a.tokens, cost: s.cost + a.cost }), { req: 0, tok: 0, cost: 0 })
    const rest = totals.requests - covered.req
    if (rest > 0) apps.push({ app: 'Ostalo (bez aplikacije)', requests: rest, tokens: Math.max(0, totals.tokens - covered.tok), cost: Math.max(0, totals.cost - covered.cost) })
  }

  return {
    totals: { ...totals, avgDurationMs: totals.durN ? totals.durSum / totals.durN : 0, errors: Math.max(0, totals.requests - totals.success) },
    models: Object.values(models).sort((a, b) => b.cost - a.cost),
    days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    dayModel,
    apps,
    cells: cellRes[0] || null,
    perGuid,
  }
}

export async function buildReportData({ from, to, currency = 'EUR', userId, isAdminUser }) {
  const { fromDate, toDate } = normalizeRange(from, to)
  const spanMs = new Date(toDate) - new Date(fromDate)
  const prevTo = new Date(new Date(fromDate).getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - spanMs)
  const conv = usdConversion(currency, toDate)
  const cur = conv.currency
  const f = conv.factor

  // Scope
  let guids = null
  let scopeName = 'Svi klijenti'
  if (!isAdminUser) {
    const rows = db.prepare(`
      SELECT m.* FROM client_tenant_mappings m
      JOIN client_tenant_users ctu ON ctu.tenant_id = m.tenant_id
      WHERE ctu.user_id = ? AND m.is_active = 1
    `).all(userId)
    if (!rows.length) return { error: 'Nalog nije povezan sa tenantom' }
    guids = rows.flatMap(r => [r.sl_tenant_guid, r.eproc_tenant_guid].filter(Boolean))
    scopeName = rows[0].tenant_name || 'Vaša organizacija'
  }

  const [now, prev, tenants] = await Promise.all([
    collect(guids, fromDate, toDate),
    collect(guids, prevFrom.toISOString(), prevTo.toISOString(), { withApps: true }),
    isAdminUser ? getTenants().catch(() => []) : Promise.resolve([]),
  ])

  // Clients / sources (internal only) from ModelTenant cells
  let clients = [], sources = []
  if (isAdminUser && now.cells) {
    const identity = buildIdentityMap(tenants)
    const resolve = makePriceResolver()
    const cellMap = {}
    for (const g of (now.cells.groups || [])) {
      const who = resolveTenant(identity, g.tenantId)
      const cell = (cellMap[`${who.key}::${who.source}`] ||= { key: who.key, name: who.name, source: who.source, requests: 0, tokens: 0, cost: 0 })
      cell.requests += g.requests || 0
      cell.tokens += g.totalTokens || 0
      cell.cost += groupCost(resolve, g)
    }
    const cells = Object.values(cellMap)
    const byC = {}, byS = {}
    for (const c of cells) {
      const rc = (byC[c.key] ||= { name: c.name, requests: 0, tokens: 0, cost: 0, sources: [] })
      rc.requests += c.requests; rc.tokens += c.tokens; rc.cost += c.cost
      rc.sources.push({ source: c.source, requests: c.requests, tokens: c.tokens, cost: c.cost * f })
      const rs = (byS[c.source] ||= { source: c.source, requests: 0, tokens: 0, cost: 0 })
      rs.requests += c.requests; rs.tokens += c.tokens; rs.cost += c.cost
    }
    clients = Object.values(byC).map(c => ({ ...c, cost: c.cost * f })).sort((a, b) => b.cost - a.cost)
    sources = Object.values(byS).map(s => ({ ...s, cost: s.cost * f })).sort((a, b) => b.cost - a.cost)
  }

  // Convert money to the target currency
  const cv = arr => arr.map(x => ({ ...x, cost: x.cost * f }))
  const totals = { ...now.totals, cost: now.totals.cost * f }
  const prevTotals = { ...prev.totals, cost: prev.totals.cost * f }

  // End-of-month projection (only meaningful when the range touches this month)
  // Projekcija = (potrošnja u POKRIVENOM periodu / broj pokrivenih dana) × dana
  // u mesecu (P1-8.9). Ranije se delilo sa rednim brojem dana u mesecu, pa je
  // izveštaj za npr. 3 dana sredinom meseca projekciju potcenio 4-5x.
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const monthDays = now.days.filter(d => new Date(d.date) >= monthStart)
  // Pokriveni kalendarski dani = presek filtriranog perioda i tekućeg meseca
  // (ne broj dana sa potrošnjom — prazni dani legitimno obaraju prosek).
  const overlapStart = new Date(Math.max(new Date(fromDate).getTime(), monthStart.getTime()))
  const overlapEnd = new Date(Math.min(new Date(toDate).getTime(), today.getTime()))
  const covered = Math.max(1, Math.floor((overlapEnd - overlapStart) / 86400000) + 1)
  const monthSpend = monthDays.reduce((s, d) => s + d.cost, 0) * f
  const projection = monthDays.length
    ? { month_spend: monthSpend, daily_avg: monthSpend / covered, projected_month: (monthSpend / covered) * daysInMonth, days_elapsed: covered, days_in_month: daysInMonth, is_estimate: true }
    : null

  // Budgets — internal: every tracked tenant; client: only their own.
  // BUDGET_SELECT already folds an assigned package into monthly_limit_eur.
  const budgets = []
  try {
    const rows = (isAdminUser
      ? db.prepare(BUDGET_SELECT).all().filter(r => r.is_tracked === 1)
      : db.prepare(`
          ${BUDGET_SELECT}
          JOIN client_tenant_users ctu ON ctu.tenant_id = b.tenant_id
          WHERE ctu.user_id = ?
        `).all(userId)
    ).filter(r => Number(r.monthly_limit_eur) > 0 || r.package_name)
    for (const row of rows) {
      try { budgets.push(await budgetStatus(row)) } catch { /* tenant unreachable */ }
    }
    budgets.sort((a, b) => (b.pct || 0) - (a.pct || 0))
  } catch { /* budgets are optional */ }

  // Pricelist (internal only)
  const global = getPricingConfig()?.global_markup_pct || 0
  const pricelist = isAdminUser
    ? db.prepare('SELECT * FROM ai_model_pricing WHERE is_active = 1 ORDER BY model_name').all().map(m => {
        const k = 1 + (global + m.model_markup_pct) / 100
        return { model: m.model_name, base_in: m.input_price_per_1m, base_out: m.output_price_per_1m, markup: global + m.model_markup_pct, final_in: m.input_price_per_1m * k, final_out: m.output_price_per_1m * k, source: m.source }
      })
    : []

  // Comparison rows (apps + models, now vs prev)
  const prevAppMap = Object.fromEntries(prev.apps.map(a => [a.app, a.cost * f]))
  const prevModelMap = Object.fromEntries(prev.models.map(m => [String(m.model).toLowerCase(), m.cost * f]))
  const apps = cv(now.apps)
  const models = cv(now.models)
  const compareApps = apps.slice(0, 6).map(a => ({ label: a.app, now: a.cost, prev: prevAppMap[a.app] || 0 }))
  const compareModels = models.slice(0, 6).map(m => ({ label: m.model, now: m.cost, prev: prevModelMap[String(m.model).toLowerCase()] || 0 }))

  return {
    audience: isAdminUser ? 'internal' : 'client',
    scopeName,
    currency: cur,
    rate_available: conv.rateAvailable,
    rate_stale: conv.rateStale || false,
    rate_age_days: conv.rateAgeDays ?? null,
    period: { from: day10(fromDate), to: day10(toDate) },
    prevPeriod: { from: day10(prevFrom.toISOString()), to: day10(prevTo.toISOString()) },
    totals, prevTotals,
    deltas: {
      cost: pctDelta(totals.cost, prevTotals.cost),
      requests: pctDelta(totals.requests, prevTotals.requests),
      tokens: pctDelta(totals.tokens, prevTotals.tokens),
    },
    days: cv(now.days),
    dayModel: cv(now.dayModel),
    clients, sources, apps, models,
    compareApps, compareModels,
    budgets, projection, pricelist,
    generated_at: new Date().toISOString(),
  }
}

// ── charts shared by both outputs ─────────────────────────────────────────────
function charts(d) {
  const m = v => money(v, d.currency)
  const internal = d.audience === 'internal'
  return {
    mainDonut: internal
      ? donut(d.clients.map(c => ({ label: c.name, value: c.cost })), { center: m(d.totals.cost), centerSub: 'ukupno', fmt: m })
      : donut(d.apps.map(a => ({ label: a.app, value: a.cost })), { center: m(d.totals.cost), centerSub: 'ukupno', fmt: m }),
    modelDonut: donut(d.models.map(x => ({ label: x.model, value: x.cost })), { center: String(d.models.length), centerSub: 'modela', fmt: m }),
    tokenDonut: donut([
      { label: 'Prompt (input)', value: d.totals.promptTokens, color: P.accent },
      { label: 'Completion (output)', value: d.totals.completionTokens, color: P.violet },
    ], { center: tok(d.totals.tokens), centerSub: 'tokena', fmt: tok }),
    sourceDonut: internal ? donut(d.sources.map((s, i) => ({ label: s.source, value: s.cost, color: SERIES[(i + 2) % SERIES.length] })), { center: String(d.sources.length), centerSub: 'izvora', fmt: m }) : null,
    trend: trend(d.days, { currency: d.currency, moneyFmt: m }),
    appBars: hbars(d.apps.map(a => ({ label: a.app, value: a.cost })), { fmt: m, color: P.teal }),
    modelTokBars: hbars(d.models.map(x => ({ label: x.model, value: x.tokens })), { fmt: tok, color: P.cyan }),
    clientBars: internal ? hbars(d.clients.map(c => ({ label: c.name, value: c.requests })), { fmt: num, color: P.accent }) : null,
    compareApps: compareBars(d.compareApps, { fmt: m, labels: ['Tekući period', 'Prethodni'] }),
    compareModels: compareBars(d.compareModels, { fmt: m, labels: ['Tekući period', 'Prethodni'] }),
    gauge: d.budgets.length ? gauge(d.budgets.map(b => ({
      label: b.tenant_name, spent: b.spent_eur, limit: b.limit_eur, pct: b.pct, warnAt: b.warning_pct,
      projPct: d.projection && b.limit_eur > 0 ? (d.projection.projected_month / b.limit_eur) * 100 : null,
    })), { fmt: v => money(v, 'EUR') }) : null,
  }
}

// ── Excel ─────────────────────────────────────────────────────────────────────

const A = { navy: 'FF0F2746', accent: 'FF2563EB', text: 'FF0F1523', muted: 'FF5A6480', white: 'FFFFFFFF', border: 'FFE2E6F0', alt: 'FFF1F5F9', green: 'FF16A34A', red: 'FFDC2626', amber: 'FFD97706' }
const XF = (o = {}) => ({ name: 'Hanken Grotesk', size: 11, ...o })

export async function buildXlsx(d) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Intelisale Project Hub'
  wb.created = new Date()
  const ch = charts(d)
  const m = v => money(v, d.currency)
  const moneyFmt = d.currency === 'USD' ? '"$"#,##0.00' : d.currency === 'EUR' ? '#,##0.00" €"' : '#,##0.00" RSD"'

  const place = async (ws, svg, wpx, hpx, col, row) => {
    const id = wb.addImage({ buffer: await svgToPng(svg), extension: 'png' })
    ws.addImage(id, { tl: { col, row }, ext: { width: wpx, height: hpx }, editAs: 'oneCell' })
  }
  const title = (ws, row, text) => {
    ws.mergeCells(`A${row}:H${row}`)
    const c = ws.getCell(`A${row}`)
    c.value = text
    c.font = XF({ size: 13, bold: true, color: { argb: A.navy } })
    ws.getRow(row).height = 22
  }
  const table = (ws, startRow, headers, rows, fmts = []) => {
    headers.forEach((h, i) => {
      const c = ws.getCell(startRow, i + 1)
      c.value = h
      c.font = XF({ bold: true, color: { argb: A.white } })
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: A.navy } }
      c.alignment = { vertical: 'middle' }
    })
    rows.forEach((r, ri) => r.forEach((v, ci) => {
      const c = ws.getCell(startRow + 1 + ri, ci + 1)
      c.value = v
      c.font = XF(ci === 0 ? { bold: true } : {})
      if (fmts[ci]) c.numFmt = fmts[ci]
      c.border = { bottom: { style: 'thin', color: { argb: A.border } } }
      if (ri % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: A.alt } }
    }))
    return startRow + rows.length + 2
  }

  // ── Sheet 1: Naslovna ──
  const s1 = wb.addWorksheet('Pregled', { views: [{ showGridLines: false }] })
  s1.columns = [{ width: 30 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }]
  s1.mergeCells('A1:H3')
  const hero = s1.getCell('A1')
  hero.value = `INTELISALE — IZVEŠTAJ O AI POTROŠNJI\n${d.scopeName}`
  hero.font = XF({ size: 18, bold: true, color: { argb: A.white } })
  hero.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
  hero.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: A.navy } }
  s1.getRow(1).height = 26; s1.getRow(2).height = 26; s1.getRow(3).height = 20
  s1.mergeCells('A4:H4')
  const meta = s1.getCell('A4')
  meta.value = `Period: ${d.period.from} — ${d.period.to}   ·   Valuta: ${d.currency}${d.rate_available === false ? ' (kurs nedostupan → USD)' : ''}${d.rate_stale ? ` (kurs star ${d.rate_age_days} dana — iznos okviran)` : ''}   ·   Prethodni period: ${d.prevPeriod.from} — ${d.prevPeriod.to}`
  meta.font = XF({ size: 10, color: { argb: A.muted } })
  meta.alignment = { indent: 1 }

  // KPI comparison — per-row number format (money rows vs count rows)
  const INT = '#,##0'
  const kpiRows = [
    ['Ukupan trošak', d.totals.cost, d.prevTotals.cost, moneyFmt],
    ['Zahtevi', d.totals.requests, d.prevTotals.requests, INT],
    ['Ukupno tokena', d.totals.tokens, d.prevTotals.tokens, INT],
    ['Prompt (input) tokeni', d.totals.promptTokens, d.prevTotals.promptTokens, INT],
    ['Completion (output) tokeni', d.totals.completionTokens, d.prevTotals.completionTokens, INT],
    ['Uspešnih zahteva', d.totals.success, d.prevTotals.success, INT],
    ['Grešaka', d.totals.errors, d.prevTotals.errors, INT],
    ['Prosečno trajanje (ms)', Math.round(d.totals.avgDurationMs), Math.round(d.prevTotals.avgDurationMs), INT],
    ['Prosečan trošak / zahtev', d.totals.requests ? d.totals.cost / d.totals.requests : 0, d.prevTotals.requests ? d.prevTotals.cost / d.prevTotals.requests : 0, moneyFmt],
  ]
  let r = 6
  const kpiStart = r
  r = table(s1, r, ['Metrika', 'Tekući period', 'Prethodni period', 'Promena %'],
    kpiRows.map(([l, now, prev]) => [l, now, prev, pctDelta(now, prev) / 100]),
    [null, null, null, '+0.0%;-0.0%'])
  kpiRows.forEach(([, , , fmt], i) => {
    s1.getCell(kpiStart + 1 + i, 2).numFmt = fmt
    s1.getCell(kpiStart + 1 + i, 3).numFmt = fmt
  })

  if (d.projection) {
    const projStart = r
    r = table(s1, r, ['Projekcija tekućeg meseca', 'Vrednost'], [
      ['Potrošeno do sada', d.projection.month_spend],
      ['Dnevni prosek', d.projection.daily_avg],
      [`Projekcija za ceo mesec (${d.projection.days_in_month} dana)`, d.projection.projected_month],
      ['Proteklo dana', d.projection.days_elapsed],
    ], [null, moneyFmt])
    s1.getCell(projStart + 4, 2).numFmt = INT // "Proteklo dana" is a count
  }

  title(s1, r, d.audience === 'internal' ? 'Trošak po klijentu' : 'Trošak po aplikaciji'); r += 1
  await place(s1, ch.mainDonut, 460, 250, 0, r - 1); r += 13
  title(s1, r, 'Tokeni: input vs output'); r += 1
  await place(s1, ch.tokenDonut, 460, 250, 0, r - 1); r += 13
  title(s1, r, 'Dnevni trend'); r += 1
  await place(s1, ch.trend, 900, 260, 0, r - 1); r += 14
  if (ch.gauge) { title(s1, r, 'Budžeti (tekući mesec, isprekidano = projekcija)'); r += 1; await place(s1, ch.gauge, 460, 40 * d.budgets.length + 16, 0, r - 1) }

  // ── Sheet: Dnevni trend ──
  const s2 = wb.addWorksheet('Dnevni trend', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
  s2.columns = [{ width: 14 }, { width: 14 }, { width: 16 }, { width: 18 }]
  table(s2, 1, ['Datum', 'Zahtevi', 'Tokeni', `Trošak (${d.currency})`],
    d.days.map(x => [x.date, x.requests, x.tokens, x.cost]), [null, '#,##0', '#,##0', moneyFmt])

  // ── Sheet: Po klijentu (internal) ──
  if (d.audience === 'internal') {
    const s3 = wb.addWorksheet('Po klijentu', { views: [{ showGridLines: false }] })
    s3.columns = [{ width: 34 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 12 }]
    let rr = table(s3, 1, ['Klijent', 'Zahtevi', 'Tokeni', `Trošak (${d.currency})`, 'Udeo'],
      d.clients.map(c => [c.name, c.requests, c.tokens, c.cost, d.totals.cost ? c.cost / d.totals.cost : 0]),
      [null, '#,##0', '#,##0', moneyFmt, '0.0%'])
    rr += 1
    title(s3, rr, 'Zahtevi po klijentu'); rr += 1
    await place(s3, ch.clientBars, 460, 26 * Math.min(8, d.clients.length) + 16, 0, rr - 1)

    const s3b = wb.addWorksheet('Klijent x izvor', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
    s3b.columns = [{ width: 34 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 18 }]
    table(s3b, 1, ['Klijent', 'Izvor', 'Zahtevi', 'Tokeni', `Trošak (${d.currency})`],
      d.clients.flatMap(c => (c.sources || []).map(s => [c.name, s.source, s.requests, s.tokens, s.cost])),
      [null, null, '#,##0', '#,##0', moneyFmt])

    const s3c = wb.addWorksheet('Po izvoru', { views: [{ showGridLines: false }] })
    s3c.columns = [{ width: 24 }, { width: 14 }, { width: 16 }, { width: 18 }]
    let rc = table(s3c, 1, ['Izvor', 'Zahtevi', 'Tokeni', `Trošak (${d.currency})`],
      d.sources.map(s => [s.source, s.requests, s.tokens, s.cost]), [null, '#,##0', '#,##0', moneyFmt])
    if (ch.sourceDonut) { rc += 1; await place(s3c, ch.sourceDonut, 460, 250, 0, rc - 1) }
  }

  // ── Sheet: Po aplikaciji ──
  const s4 = wb.addWorksheet('Po aplikaciji', { views: [{ showGridLines: false }] })
  s4.columns = [{ width: 42 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 12 }]
  let r4 = table(s4, 1, ['Aplikacija / akcija', 'Zahtevi', 'Tokeni', `Trošak (${d.currency})`, 'Udeo'],
    d.apps.map(a => [a.app, a.requests, a.tokens, a.cost, d.totals.cost ? a.cost / d.totals.cost : 0]),
    [null, '#,##0', '#,##0', moneyFmt, '0.0%'])
  r4 += 1
  title(s4, r4, 'Top aplikacije po trošku'); r4 += 1
  await place(s4, ch.appBars, 460, 26 * Math.min(8, d.apps.length) + 16, 0, r4 - 1)

  // ── Sheet: Po modelu ──
  const s5 = wb.addWorksheet('Po modelu', { views: [{ showGridLines: false }] })
  s5.columns = [{ width: 26 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 12 }]
  let r5 = table(s5, 1, ['Model', 'Zahtevi', 'Prompt tokeni', 'Completion tokeni', 'Ukupno tokena', `Trošak (${d.currency})`, 'Ima cenu'],
    d.models.map(x => [x.model, x.requests, x.promptTokens, x.completionTokens, x.tokens, x.cost, x.priced ? 'da' : 'ne']),
    [null, '#,##0', '#,##0', '#,##0', '#,##0', moneyFmt])
  r5 += 1
  title(s5, r5, 'Trošak po modelu'); r5 += 1
  await place(s5, ch.modelDonut, 460, 250, 0, r5 - 1); r5 += 13
  title(s5, r5, 'Tokeni po modelu'); r5 += 1
  await place(s5, ch.modelTokBars, 460, 26 * Math.min(8, d.models.length) + 16, 0, r5 - 1)

  // ── Sheet: Poređenje perioda ──
  const s6 = wb.addWorksheet('Poređenje', { views: [{ showGridLines: false }] })
  s6.columns = [{ width: 42 }, { width: 18 }, { width: 18 }, { width: 14 }]
  let r6 = table(s6, 1, ['Aplikacija', `Tekući (${d.currency})`, `Prethodni (${d.currency})`, 'Promena %'],
    d.compareApps.map(x => [x.label, x.now, x.prev, pctDelta(x.now, x.prev) / 100]), [null, moneyFmt, moneyFmt, '+0.0%;-0.0%'])
  r6 = table(s6, r6, ['Model', `Tekući (${d.currency})`, `Prethodni (${d.currency})`, 'Promena %'],
    d.compareModels.map(x => [x.label, x.now, x.prev, pctDelta(x.now, x.prev) / 100]), [null, moneyFmt, moneyFmt, '+0.0%;-0.0%'])
  r6 += 1
  await place(s6, ch.compareApps, 460, 240, 0, r6 - 1)
  await place(s6, ch.compareModels, 460, 240, 5, r6 - 1)

  // ── Sheet: Budžeti ──
  if (d.budgets.length) {
    const s7 = wb.addWorksheet('Budžeti', { views: [{ showGridLines: false }] })
    s7.columns = [{ width: 34 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }]
    table(s7, 1, ['Tenant', 'Paket', 'Pristup (EUR)', 'Uklj. potrošnja (EUR)', 'Potrošeno (EUR)', 'Prekoračenje (EUR)', 'Iskorišćeno', 'Status'],
      d.budgets.map(b => [b.tenant_name, b.package?.name || '—', b.package?.fee_eur || 0, b.limit_eur || 0,
        b.spent_eur, b.overage_eur || 0, (b.pct || 0) / 100, b.level]),
      [null, null, '#,##0.00" €"', '#,##0.00" €"', '#,##0.00" €"', '#,##0.00" €"', '0.0%'])
  }

  // ── Sheet: Sirovi podaci (dan × model) ──
  const s8 = wb.addWorksheet('Sirovi podaci', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
  s8.columns = [{ width: 14 }, { width: 26 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }]
  table(s8, 1, ['Datum', 'Model', 'Zahtevi', 'Prompt tokeni', 'Completion tokeni', `Trošak (${d.currency})`],
    d.dayModel.map(x => [x.date, x.model, x.requests, x.promptTokens, x.completionTokens, x.cost]),
    [null, null, '#,##0', '#,##0', '#,##0', moneyFmt])

  // ── Sheet: Cenovnik (internal only) ──
  if (d.audience === 'internal' && d.pricelist.length) {
    const s9 = wb.addWorksheet('Cenovnik', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] })
    s9.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 12 }]
    table(s9, 1, ['Model', 'Bazna in / 1M', 'Bazna out / 1M', 'Marža %', 'Finalna in', 'Finalna out', 'Izvor'],
      d.pricelist.map(p => [p.model, p.base_in, p.base_out, p.markup / 100, p.final_in, p.final_out, p.source]),
      [null, '#,##0.0000', '#,##0.0000', '0.0%', '#,##0.0000', '#,##0.0000'])
  }

  return wb
}

// ── HTML / PDF ────────────────────────────────────────────────────────────────

export function buildReportHtml(d) {
  const ch = charts(d)
  const m = v => money(v, d.currency)
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const delta = v => {
    const up = v >= 0
    const color = up ? '#DC2626' : '#16A34A' // more spend = red
    return `<span style="color:${color};font-weight:600">${up ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</span>`
  }
  const kpi = (l, v, extra = '') => `<div style="flex:1;min-width:150px;background:#fff;border:1px solid #E2E6F0;border-radius:12px;padding:14px 16px">
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5A6480">${esc(l)}</div>
      <div style="font-size:22px;font-weight:800;color:#0F1523;margin-top:2px">${v}</div>
      ${extra ? `<div style="font-size:11px;color:#5A6480;margin-top:3px">${extra}</div>` : ''}
    </div>`
  const tbl = (head, rows) => rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:8px">
      <thead><tr>${head.map(h => `<th style="text-align:${h.r ? 'right' : 'left'};padding:7px 9px;background:#0F2746;color:#fff;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em">${esc(h.t)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row, i) => `<tr style="background:${i % 2 ? '#F8F9FC' : '#fff'}">${row.map((c, ci) => `<td style="padding:6px 9px;border-bottom:1px solid #E2E6F0;${head[ci]?.r ? 'text-align:right;font-family:ui-monospace,monospace' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>` : '<p style="font-size:12px;color:#5A6480">Nema podataka.</p>'
  const section = (title, body) => `<section style="margin-top:26px;page-break-inside:avoid">
      <h2 style="font-size:14px;margin:0 0 8px;color:#0F2746;border-bottom:2px solid #38BDF8;padding-bottom:6px">${esc(title)}</h2>${body}</section>`
  const chart = svg => `<div style="margin:10px 0">${svg}</div>`

  const internal = d.audience === 'internal'
  return `<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8">
<title>AI potrošnja — ${esc(d.scopeName)} (${d.period.from} — ${d.period.to})</title>
<style>
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Hanken Grotesk','Segoe UI',Arial,sans-serif;color:#0F1523;background:#F0F2F8;margin:0;padding:26px}
  .page{max-width:900px;margin:0 auto}
  svg{max-width:100%;height:auto}
  /* margin:0 removes the browser's own header/footer (URL, date, page title);
     the body padding takes over as the page margin */
  @page{size:A4;margin:0}
  @media print{body{background:#fff;padding:12mm 14mm}.noprint{display:none}section{page-break-inside:avoid}}
</style></head><body><div class="page">
  <div class="noprint" style="text-align:right;margin-bottom:12px">
    <button onclick="window.print()" style="background:#7C3AED;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-weight:600;cursor:pointer">Sačuvaj kao PDF</button>
  </div>

  <div style="background:linear-gradient(135deg,#0b1a2f,#0f2746 55%,#163e6b);border-radius:16px;padding:26px 30px;color:#fff">
    <div style="font-size:11px;letter-spacing:.16em;color:#38BDF8;margin-bottom:9px">INTELISALE — IZVEŠTAJ O AI POTROŠNJI${internal ? ' · INTERNO' : ''}</div>
    <div style="font-size:25px;font-weight:800;line-height:1.15">${esc(d.scopeName)}</div>
    <div style="font-size:12px;color:#9FB2C9;margin-top:9px">
      Period: ${d.period.from} — ${d.period.to} · Valuta: ${d.currency}${d.rate_available === false ? ' (kurs nedostupan → USD)' : ''}${d.rate_stale ? ` (kurs star ${d.rate_age_days} dana — iznos okviran)` : ''}
      · Poređenje sa: ${d.prevPeriod.from} — ${d.prevPeriod.to}
    </div>
  </div>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
    ${kpi('Ukupan trošak', m(d.totals.cost), `vs prethodni ${m(d.prevTotals.cost)} ${delta(d.deltas.cost)}`)}
    ${kpi('Zahtevi', num(d.totals.requests), `${delta(d.deltas.requests)} vs prethodni`)}
    ${kpi('Tokeni', tok(d.totals.tokens), `in ${tok(d.totals.promptTokens)} · out ${tok(d.totals.completionTokens)}`)}
    ${kpi('Trošak / zahtev', d.totals.requests ? m(d.totals.cost / d.totals.requests) : '—', `greške: ${num(d.totals.errors)}`)}
  </div>

  ${(() => {
    const withPkg = d.budgets.filter(b => b.package)
    if (!withPkg.length) return ''
    return withPkg.map(b => {
      const p = b.package
      const pct = Math.min(100, Math.max(0, b.pct || 0))
      const color = pct >= 100 ? '#DC2626' : pct >= (b.warning_pct || 80) ? '#D97706' : '#16A34A'
      return `<div style="margin-top:12px;background:#fff;border:1px solid #E2E6F0;border-radius:12px;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">
          <div style="font-size:13px;font-weight:700;color:#0F2746">
            ${internal ? esc(b.tenant_name) + ' · ' : ''}Paket <span style="background:#0F2746;color:#fff;border-radius:6px;padding:2px 10px;margin-left:4px">${esc(p.name)}</span>
          </div>
          <div style="font-size:13px;font-weight:700">${money(p.fee_eur + p.included_eur, 'EUR')} / mes
            <span style="font-weight:400;color:#5A6480;font-size:11.5px">(pristup ${money(p.fee_eur, 'EUR')} + uklj. potrošnja ${money(p.included_eur, 'EUR')})</span></div>
        </div>
        <div style="margin-top:10px;background:#E2E6F0;border-radius:6px;height:12px;overflow:hidden">
          <div style="width:${pct.toFixed(1)}%;height:100%;background:${color}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#5A6480;margin-top:5px">
          <span>iskorišćeno ${money(b.spent_eur, 'EUR')} od ${money(b.limit_eur, 'EUR')} uključene potrošnje (${Math.round(b.pct || 0)}%)</span>
          <span>${(b.overage_eur || 0) > 0 ? `<strong style="color:#DC2626">prekoračenje ${money(b.overage_eur, 'EUR')}</strong>` : 'resetuje se 1. u mesecu'}</span>
        </div>
      </div>`
    }).join('')
  })()}

  ${d.projection ? `<div style="margin-top:12px;background:#EFF6FF;border:1px solid #93C5FD;border-radius:12px;padding:14px 16px">
    <div style="font-size:12px;font-weight:700;color:#0F2746;margin-bottom:4px">Projekcija tekućeg meseca</div>
    <div style="font-size:12px;color:#0F1523">
      Potrošeno ${m(d.projection.month_spend)} u ${d.projection.days_elapsed} dana ·
      dnevni prosek ${m(d.projection.daily_avg)} ·
      <strong>projekcija za ceo mesec: ${m(d.projection.projected_month)}</strong> (${d.projection.days_in_month} dana)
    </div></div>` : ''}

  ${section('Dnevni trend', chart(ch.trend))}

  ${internal ? section('Po klijentu', chart(ch.mainDonut) + chart(ch.clientBars) + tbl(
      [{ t: 'Klijent' }, { t: 'Zahtevi', r: 1 }, { t: 'Tokeni', r: 1 }, { t: 'Trošak', r: 1 }, { t: 'Udeo', r: 1 }],
      d.clients.map(c => [esc(c.name), num(c.requests), tok(c.tokens), m(c.cost), d.totals.cost ? Math.round(c.cost / d.totals.cost * 100) + '%' : '—'])))
    : ''}

  ${internal && ch.sourceDonut ? section('Po izvoru (SalesLeader / eProcurement)', chart(ch.sourceDonut) + tbl(
      [{ t: 'Izvor' }, { t: 'Zahtevi', r: 1 }, { t: 'Tokeni', r: 1 }, { t: 'Trošak', r: 1 }],
      d.sources.map(s => [esc(s.source), num(s.requests), tok(s.tokens), m(s.cost)]))) : ''}

  ${section('Po aplikaciji', (internal ? '' : chart(ch.mainDonut)) + chart(ch.appBars) + tbl(
      [{ t: 'Aplikacija' }, { t: 'Zahtevi', r: 1 }, { t: 'Tokeni', r: 1 }, { t: 'Trošak', r: 1 }, { t: 'Udeo', r: 1 }],
      d.apps.map(a => [esc(a.app), num(a.requests), tok(a.tokens), m(a.cost), d.totals.cost ? Math.round(a.cost / d.totals.cost * 100) + '%' : '—'])))}

  ${section('Po modelu', chart(ch.modelDonut) + chart(ch.tokenDonut) + chart(ch.modelTokBars) + tbl(
      [{ t: 'Model' }, { t: 'Zahtevi', r: 1 }, { t: 'Input', r: 1 }, { t: 'Output', r: 1 }, { t: 'Trošak', r: 1 }],
      d.models.map(x => [esc(x.model), num(x.requests), tok(x.promptTokens), tok(x.completionTokens), m(x.cost)])))}

  ${section('Poređenje sa prethodnim periodom', chart(ch.compareApps) + chart(ch.compareModels) + tbl(
      [{ t: 'Stavka' }, { t: 'Tekući', r: 1 }, { t: 'Prethodni', r: 1 }, { t: 'Promena', r: 1 }],
      [...d.compareApps, ...d.compareModels].map(x => [esc(x.label), m(x.now), m(x.prev), delta(pctDelta(x.now, x.prev))])))}

  ${d.budgets.length ? section('Budžeti (tekući mesec)', chart(ch.gauge) + tbl(
      [{ t: 'Tenant' }, { t: 'Paket' }, { t: 'Pristup', r: 1 }, { t: 'Uklj. potrošnja', r: 1 }, { t: 'Potrošeno', r: 1 }, { t: 'Iskorišćeno', r: 1 }, { t: 'Status', r: 1 }],
      d.budgets.map(b => [esc(b.tenant_name), esc(b.package?.name || '—'), b.package ? money(b.package.fee_eur, 'EUR') : '—',
        money(b.limit_eur, 'EUR'), money(b.spent_eur, 'EUR'), Math.round(b.pct || 0) + '%', b.level]))) : ''}

  ${internal && d.pricelist.length ? section('Cenovnik (interno)', tbl(
      [{ t: 'Model' }, { t: 'Bazna in', r: 1 }, { t: 'Bazna out', r: 1 }, { t: 'Marža', r: 1 }, { t: 'Finalna in', r: 1 }, { t: 'Finalna out', r: 1 }],
      d.pricelist.map(p => [esc(p.model), p.base_in.toFixed(4), p.base_out.toFixed(4), p.markup.toFixed(1) + '%', p.final_in.toFixed(4), p.final_out.toFixed(4)]))) : ''}

  <div style="margin-top:34px;padding-top:14px;border-top:1px solid #E2E6F0;font-size:10px;color:#A0AABF;text-align:center;letter-spacing:.1em">
    INTELISALE · EMPOWERING SALES EXCELLENCE · generisano ${String(d.generated_at).slice(0, 16).replace('T', ' ')}
  </div>
</div></body></html>`
}
