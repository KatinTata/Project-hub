// Model pricing: OUR price = Azure base × (1 + (global + per-model markup)/100).
// Never the Admin API's cost fields. Spec §4–§5.

import db from '../db.js'

export function getPricingConfig() {
  return db.prepare('SELECT * FROM ai_pricing_config WHERE id = 1').get()
}

// Fuzzy price resolution (§4.1): exact or substring either way; the most
// specific (longest) model name wins so gpt-4o never swallows gpt-4o-mini.
const priceStmt = () => db.prepare(`
  SELECT m.model_name, m.input_price_per_1m, m.output_price_per_1m, m.model_markup_pct, c.global_markup_pct
  FROM ai_model_pricing m
  CROSS JOIN ai_pricing_config c
  WHERE m.is_active = 1
    AND (m.model_name = ? OR ? LIKE '%' || m.model_name || '%' OR m.model_name LIKE '%' || ? || '%')
  ORDER BY (m.model_name = ?) DESC, length(m.model_name) DESC
  LIMIT 1
`)

export function makePriceResolver() {
  const memo = new Map()
  const stmt = priceStmt()
  return function resolve(modelName) {
    const name = String(modelName || '').toLowerCase().trim()
    if (memo.has(name)) return memo.get(name)
    const row = name ? stmt.get(name, name, name, name) : null
    const markup = row ? 1 + ((row.global_markup_pct || 0) + (row.model_markup_pct || 0)) / 100 : 1
    const out = {
      inputPer1m: row ? row.input_price_per_1m * markup : 0,
      outputPer1m: row ? row.output_price_per_1m * markup : 0,
      priced: !!row && (row.input_price_per_1m > 0 || row.output_price_per_1m > 0),
    }
    memo.set(name, out)
    return out
  }
}

// Cost of one usage group (tokens are per-model exact, §4)
export function groupCost(resolve, group) {
  const p = resolve(group.modelName)
  return (group.promptTokens || 0) / 1e6 * p.inputPer1m + (group.completionTokens || 0) / 1e6 * p.outputPer1m
}

// Price a list of Model* groups → { totalCost, unpricedModels[] }
export function costModelGroups(groups) {
  const resolve = makePriceResolver()
  let total = 0
  const unpriced = new Set()
  for (const g of (groups || [])) {
    if (!g.modelName) continue
    total += groupCost(resolve, g)
    if (!resolve(g.modelName).priced) unpriced.add(String(g.modelName).toLowerCase())
  }
  return { totalCost: total, unpricedModels: [...unpriced], resolve }
}

// ── Azure Retail Prices sync (§5) ────────────────────────────────────────────

const SKIP_RE = /batch|cached|cchd|realtime|audio|\baud\b|aud\d|tts|image|transcribe|tcrb|grader|grdr|\brt\b|\bft\b/i
const CANONICAL = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4-32k', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-nano', 'gpt-5', 'gpt-4', 'o4-mini', 'o3-mini', 'o1-mini']

function normalizeMeter(meterName) {
  const raw = String(meterName || '')
  if (SKIP_RE.test(raw)) return null
  let dir = null
  if (/\b(input|inp|inpt)\b/i.test(raw)) dir = 'input'
  else if (/\b(output|outp|outpt)\b/i.test(raw)) dir = 'output'
  if (!dir) return null
  let s = raw.toLowerCase()
    .replace(/tokens?/g, ' ')
    .replace(/\b(input|inp|inpt|output|outp|outpt)\b/g, ' ')
    .replace(/\b(global|glbl|gl)\b/g, ' ')
    .replace(/\b(data zone|dzone|dzn|d z)\b/g, ' ')
    .replace(/\b(regional|regnl)\b/g, ' ')
    .replace(/\b(standard|std)\b/g, ' ')
    .replace(/\b(1m|1k)\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // canonical: most specific first (CANONICAL is ordered accordingly)
  for (const c of CANONICAL) if (s.includes(c)) return { model: c, dir, isGlobal: /glbl|global/i.test(raw) }
  return null
}

export function pricePer1M(retailPrice, unitOfMeasure) {
  // Stara verzija je koristila includes('100') — jedinica "1000 Tokens" sadrži
  // "100" kao podstring, pa je cena množena 10.000x umesto 1.000x (10x naduvana).
  // Zato: eksplicitni oblici prvo, pa generičko parsiranje količine.
  const u = String(unitOfMeasure || '').trim()
  if (/\b1\s*M\b/i.test(u) || /\b1[,.]?000[,.]?000\b/.test(u)) return retailPrice
  if (/\b1\s*K\b/i.test(u)) return retailPrice * 1000
  const m = u.match(/(\d[\d,.\s]*)/)
  if (m) {
    const qty = parseInt(m[1].replace(/[,.\s]/g, ''), 10)
    if (qty > 0) return retailPrice * (1_000_000 / qty)
  }
  console.warn(`[ai-pricing] Nepoznata jedinica mere "${unitOfMeasure}" — pretpostavljam 1K tokena`)
  return retailPrice * 1000 // konzervativan fallback kao i ranije
}

export async function syncAzurePrices(changedBy = 'sync') {
  const cfg = getPricingConfig()
  const base = cfg?.pricing_source_url || 'https://prices.azure.com/api/retail/prices'
  const filter = "serviceName eq 'Foundry Models' and type eq 'Consumption'"
  let url = `${base}?api-version=2023-01-01-preview&$filter=${encodeURIComponent(filter)}`

  // model → { input: {price, global}, output: {price, global} }
  const found = {}
  try {
    let pages = 0
    while (url && pages < 60) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`Azure prices ${res.status}`)
      const data = await res.json()
      for (const item of (data.Items || [])) {
        const norm = normalizeMeter(item.meterName)
        if (!norm) continue
        const price = pricePer1M(item.retailPrice, item.unitOfMeasure)
        if (!(price > 0)) continue
        const slot = (found[norm.model] ||= {})
        const cur = slot[norm.dir]
        // dedup rule (§5.3): global beats non-global; otherwise first non-zero wins
        if (!cur || (norm.isGlobal && !cur.global)) slot[norm.dir] = { price, global: norm.isGlobal }
      }
      url = data.NextPageLink || null
      pages++
    }

    const upsert = db.prepare(`
      INSERT INTO ai_model_pricing (model_name, input_price_per_1m, output_price_per_1m, source, last_synced_at, updated_at)
      VALUES (?, ?, ?, 'azure', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (model_name) DO UPDATE SET
        input_price_per_1m = excluded.input_price_per_1m,
        output_price_per_1m = excluded.output_price_per_1m,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE ai_model_pricing.source = 'azure'
    `)
    const getRow = db.prepare('SELECT * FROM ai_model_pricing WHERE model_name = ?')
    const audit = db.prepare(`
      INSERT INTO ai_model_pricing_history (model_name, old_input_per_1m, new_input_per_1m, old_output_per_1m, new_output_per_1m, source, changed_by)
      VALUES (?, ?, ?, ?, ?, 'azure', ?)
    `)

    let updated = 0
    for (const [model, slot] of Object.entries(found)) {
      const inP = slot.input?.price || 0
      const outP = slot.output?.price || 0
      const prev = getRow.get(model)
      if (prev && prev.source !== 'azure') continue // never overwrite manual rows (§5.4)
      const changed = !prev || Math.abs(prev.input_price_per_1m - inP) > 1e-9 || Math.abs(prev.output_price_per_1m - outP) > 1e-9
      upsert.run(model, inP, outP)
      if (changed) {
        audit.run(model, prev ? prev.input_price_per_1m : null, inP, prev ? prev.output_price_per_1m : null, outP, changedBy)
        updated++
      }
    }

    db.prepare('UPDATE ai_pricing_config SET last_synced_at = CURRENT_TIMESTAMP, last_sync_ok = 1, last_sync_message = ? WHERE id = 1')
      .run(`OK — ${Object.keys(found).length} modela, ${updated} promena`)
    return { ok: true, models: Object.keys(found).length, changed: updated }
  } catch (err) {
    db.prepare('UPDATE ai_pricing_config SET last_synced_at = CURRENT_TIMESTAMP, last_sync_ok = 0, last_sync_message = ? WHERE id = 1')
      .run(String(err.message || err).slice(0, 490))
    throw err
  }
}
