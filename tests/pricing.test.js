// Golden-master testovi za server/aiUsage/pricing.js.
// db se mockuje in-memory bazom sa minimalnom šemom.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/db.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE ai_pricing_config (
      id INTEGER PRIMARY KEY,
      global_markup_pct REAL DEFAULT 0,
      tool_price_per_request REAL NOT NULL DEFAULT 0,
      pricing_source_url TEXT,
      last_synced_at TEXT, last_sync_ok INTEGER, last_sync_message TEXT
    );
    INSERT INTO ai_pricing_config (id, global_markup_pct) VALUES (1, 0);
    CREATE TABLE ai_model_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name TEXT UNIQUE,
      input_price_per_1m REAL DEFAULT 0,
      output_price_per_1m REAL DEFAULT 0,
      model_markup_pct REAL DEFAULT 0,
      source TEXT DEFAULT 'azure',
      is_active INTEGER DEFAULT 1,
      last_synced_at TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE ai_model_pricing_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name TEXT,
      old_input_per_1m REAL, new_input_per_1m REAL,
      old_output_per_1m REAL, new_output_per_1m REAL,
      source TEXT, changed_by TEXT,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)
  return { default: db }
})

import db from '../server/db.js'
import { makePriceResolver, groupCost, costModelGroups, pricePer1M, normalizeMeter, syncAzurePrices } from '../server/aiUsage/pricing.js'

function seed(rows, globalMarkup = 0) {
  db.prepare('DELETE FROM ai_model_pricing').run()
  db.prepare('DELETE FROM ai_model_pricing_history').run()
  db.prepare('UPDATE ai_pricing_config SET global_markup_pct = ?, tool_price_per_request = 0 WHERE id = 1').run(globalMarkup)
  const ins = db.prepare('INSERT INTO ai_model_pricing (model_name, input_price_per_1m, output_price_per_1m, model_markup_pct, is_active) VALUES (?, ?, ?, ?, ?)')
  for (const r of rows) ins.run(r.model, r.input, r.output, r.markup || 0, r.active === false ? 0 : 1)
}

beforeEach(() => seed([]))

describe('pricePer1M', () => {
  it.each([
    ['1M Tokens', 5, 5],
    ['1,000,000 Tokens', 5, 5],
    ['1000 Tokens', 5, 5000],   // [ispravka P0-5] ranije 50.000 (10x naduvano)
    ['1K Tokens', 5, 5000],
    ['1K', 5, 5000],
    ['100', 5, 50000],
    ['10000 Tokens', 5, 500],
    ['', 5, 5000],              // fallback uz warn
  ])('jedinica "%s" → %d × faktor = %d', (unit, price, expected) => {
    expect(pricePer1M(price, unit)).toBe(expected)
  })
})

describe('makePriceResolver — rezolucija modela', () => {
  it('egzaktno poklapanje sa cenom', () => {
    seed([{ model: 'gpt-4o', input: 2.5, output: 10 }])
    const r = makePriceResolver()('gpt-4o')
    expect(r.inputPer1m).toBe(2.5)
    expect(r.outputPer1m).toBe(10)
    expect(r.priced).toBe(true)
  })

  it('najduže (najspecifičnije) ime pobeđuje: gpt-4o-mini ne pada na gpt-4o', () => {
    seed([
      { model: 'gpt-4o', input: 2.5, output: 10 },
      { model: 'gpt-4o-mini', input: 0.15, output: 0.6 },
    ])
    const resolve = makePriceResolver()
    expect(resolve('gpt-4o-mini').inputPer1m).toBe(0.15)
    expect(resolve('gpt-4o').inputPer1m).toBe(2.5)
  })

  it('deployment ime sa sufiksom se poklapa substring-om', () => {
    seed([{ model: 'gpt-4o', input: 2.5, output: 10 }])
    expect(makePriceResolver()('my-gpt-4o-deployment').priced).toBe(true)
  })

  // [ISPRAVKA P1-8.10] gpt-4o bez svog reda NE pada na gpt-4 — necenovan umesto tiho pogrešan
  it('gpt-4o bez svog reda je necenovan, ne dobija cenu gpt-4', () => {
    seed([{ model: 'gpt-4', input: 30, output: 60 }])
    const r = makePriceResolver()('gpt-4o')
    expect(r.priced).toBe(false)
    expect(r.inputPer1m).toBe(0)
  })

  it('gpt-4.1-nano ne pada na gpt-4 (tačka je deo imena)', () => {
    seed([{ model: 'gpt-4', input: 30, output: 60 }])
    expect(makePriceResolver()('gpt-4.1-nano').priced).toBe(false)
  })

  it('gpt-4o ne dobija cenu gpt-4o-mini kad egzaktan red ne postoji', () => {
    seed([{ model: 'gpt-4o-mini', input: 0.15, output: 0.6 }])
    expect(makePriceResolver()('gpt-4o').priced).toBe(false)
  })

  it('nepoznat model (Claude) → priced=false, cena 0', () => {
    seed([{ model: 'gpt-4o', input: 2.5, output: 10 }])
    const r = makePriceResolver()('claude-sonnet-4')
    expect(r.priced).toBe(false)
    expect(r.inputPer1m).toBe(0)
  })

  it('neaktivan red se ignoriše', () => {
    seed([{ model: 'gpt-4o', input: 2.5, output: 10, active: false }])
    expect(makePriceResolver()('gpt-4o').priced).toBe(false)
  })

  it('marža: globalna + po modelu se sabiraju', () => {
    seed([{ model: 'gpt-4o', input: 100, output: 200, markup: 5 }], 10)
    const r = makePriceResolver()('gpt-4o')
    expect(r.inputPer1m).toBeCloseTo(115)  // 100 × (1 + 15/100)
    expect(r.outputPer1m).toBeCloseTo(230)
  })

  it('memoizacija: isti upit ne menja rezultat', () => {
    seed([{ model: 'gpt-4o', input: 2.5, output: 10 }])
    const resolve = makePriceResolver()
    const a = resolve('gpt-4o')
    const b = resolve('GPT-4O') // lowercase normalizacija
    expect(b).toEqual(a)
  })
})

describe('groupCost i costModelGroups', () => {
  it('trošak = tokeni/1M × cena', () => {
    seed([{ model: 'gpt-4o', input: 2, output: 8 }])
    const resolve = makePriceResolver()
    const cost = groupCost(resolve, { modelName: 'gpt-4o', promptTokens: 500_000, completionTokens: 250_000 })
    expect(cost).toBeCloseTo(0.5 * 2 + 0.25 * 8) // 1 + 2 = 3
  })

  it('costModelGroups skuplja necenovan modele', () => {
    seed([{ model: 'gpt-4o', input: 2, output: 8 }])
    const { totalCost, unpricedModels } = costModelGroups([
      { modelName: 'gpt-4o', promptTokens: 1_000_000, completionTokens: 0 },
      { modelName: 'claude-opus-4', promptTokens: 1_000_000, completionTokens: 0 },
    ])
    expect(totalCost).toBeCloseTo(2) // claude košta 0 [BUG P1-8.11 kontekst]
    expect(unpricedModels).toEqual(['claude-opus-4'])
  })

  it('grupa bez modela košta 0 kad cena po zahtevu nije podešena', () => {
    const { totalCost, unpricedModels } = costModelGroups([{ modelName: '', promptTokens: 1e6, requests: 50 }])
    expect(totalCost).toBe(0)
    expect(unpricedModels).toEqual([])
  })

  it('grupa bez modela se naplaćuje po zahtevu (tool_price_per_request)', () => {
    seed([{ model: 'gpt-4o', input: 2, output: 8 }])
    db.prepare('UPDATE ai_pricing_config SET tool_price_per_request = 0.002 WHERE id = 1').run()
    const resolve = makePriceResolver()
    // grupa bez modela: 50 zahteva × 0.002 = 0.1; tokeni se ignorišu
    expect(groupCost(resolve, { modelName: null, requests: 50, promptTokens: 1e6 })).toBeCloseTo(0.1)
    // grupa sa modelom se i dalje naplaćuje po tokenima, ne po zahtevu
    expect(groupCost(resolve, { modelName: 'gpt-4o', requests: 50, promptTokens: 1_000_000, completionTokens: 0 })).toBeCloseTo(2)
    const { totalCost, unpricedModels } = costModelGroups([
      { modelName: 'gpt-4o', promptTokens: 1_000_000, completionTokens: 0, requests: 1 },
      { modelName: null, requests: 100 },
    ])
    expect(totalCost).toBeCloseTo(2 + 0.2)
    expect(unpricedModels).toEqual([]) // red bez modela nije „necenovan model"
  })
})

describe('normalizeMeter', () => {
  it('prepoznaje input/output smer', () => {
    expect(normalizeMeter('gpt-4o 0806 Input Tokens')).toEqual({ model: 'gpt-4o', dir: 'input', isGlobal: false })
    expect(normalizeMeter('gpt-4o 0806 Output Tokens')?.dir).toBe('output')
  })

  it('glbl/global se detektuje', () => {
    expect(normalizeMeter('gpt-4o glbl Input Tokens')?.isGlobal).toBe(true)
  })

  it('najspecifičniji kanonski model pobeđuje', () => {
    expect(normalizeMeter('gpt-4o-mini Input Tokens')?.model).toBe('gpt-4o-mini')
    expect(normalizeMeter('gpt-4.1-nano Input Tokens')?.model).toBe('gpt-4.1-nano')
  })

  it('batch/cached/audio meteri se preskaču', () => {
    expect(normalizeMeter('gpt-4o Batch Input Tokens')).toBe(null)
    expect(normalizeMeter('gpt-4o cached Input Tokens')).toBe(null)
    expect(normalizeMeter('gpt-4o Audio Input Tokens')).toBe(null)
  })

  it('bez smera ili bez kanonskog modela → null', () => {
    expect(normalizeMeter('gpt-4o Training Tokens')).toBe(null)
    expect(normalizeMeter('llama-3 Input Tokens')).toBe(null)
  })

  // [ISPRAVKA P1-8.11] Claude i drugi ne-GPT modeli su sada u CANONICAL
  it('claude meteri su obuhvaćeni', () => {
    expect(normalizeMeter('claude-sonnet Input Tokens')?.model).toBe('claude-sonnet')
    expect(normalizeMeter('claude-sonnet-4.5 glbl Input Tokens')?.model).toBe('claude-sonnet-4.5')
    expect(normalizeMeter('deepseek-r1 Output Tokens')?.model).toBe('deepseek-r1')
  })
})

describe('syncAzurePrices (mock fetch)', () => {
  function mockAzure(items) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ Items: items, NextPageLink: null }),
    })))
  }

  it('upisuje cene, global pobeđuje non-global, istorija se beleži', async () => {
    seed([])
    mockAzure([
      { meterName: 'gpt-4o 0806 Input Tokens', retailPrice: 2.5, unitOfMeasure: '1M Tokens' },
      { meterName: 'gpt-4o glbl Input Tokens', retailPrice: 2.0, unitOfMeasure: '1M Tokens' },
      { meterName: 'gpt-4o Output Tokens', retailPrice: 10, unitOfMeasure: '1M Tokens' },
    ])
    const res = await syncAzurePrices('test')
    expect(res.ok).toBe(true)
    const row = db.prepare("SELECT * FROM ai_model_pricing WHERE model_name = 'gpt-4o'").get()
    expect(row.input_price_per_1m).toBe(2.0) // global pobedio
    expect(row.output_price_per_1m).toBe(10)
    const hist = db.prepare('SELECT COUNT(*) c FROM ai_model_pricing_history').get()
    expect(hist.c).toBe(1)
    vi.unstubAllGlobals()
  })

  it('manual redovi se ne prepisuju', async () => {
    seed([])
    db.prepare("INSERT INTO ai_model_pricing (model_name, input_price_per_1m, output_price_per_1m, source) VALUES ('gpt-4o', 99, 99, 'manual')").run()
    mockAzure([{ meterName: 'gpt-4o Input Tokens', retailPrice: 2.5, unitOfMeasure: '1M Tokens' }])
    await syncAzurePrices('test')
    const row = db.prepare("SELECT * FROM ai_model_pricing WHERE model_name = 'gpt-4o'").get()
    expect(row.input_price_per_1m).toBe(99)
    expect(row.source).toBe('manual')
    vi.unstubAllGlobals()
  })

  it('pad mreže → last_sync_ok = 0 i baca grešku', async () => {
    seed([])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    await expect(syncAzurePrices('test')).rejects.toThrow()
    const cfg = db.prepare('SELECT last_sync_ok FROM ai_pricing_config WHERE id = 1').get()
    expect(cfg.last_sync_ok).toBe(0)
    vi.unstubAllGlobals()
  })
})
