// Golden-master testovi za server/aiUsage/fx.js (kursevi NBS).
// db se mockuje in-memory bazom.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/db.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE ap_exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      currency_from TEXT NOT NULL,
      currency_to TEXT NOT NULL,
      rate REAL NOT NULL,
      rate_date TEXT NOT NULL,
      source TEXT,
      UNIQUE (currency_from, currency_to, rate_date)
    );
  `)
  return { default: db }
})

import db from '../server/db.js'
import { getRate, usdConversion, fetchTodaysRates } from '../server/aiUsage/fx.js'

function seedRates(rows) {
  db.prepare('DELETE FROM ap_exchange_rates').run()
  const ins = db.prepare("INSERT INTO ap_exchange_rates (currency_from, currency_to, rate, rate_date, source) VALUES (?, 'RSD', ?, ?, 'test')")
  for (const r of rows) ins.run(r.cur, r.rate, r.date)
}

beforeEach(() => seedRates([]))

describe('getRate', () => {
  it('egzaktan datum', () => {
    seedRates([{ cur: 'USD', rate: 108.5, date: '2026-08-10' }])
    expect(getRate('USD', '2026-08-10')).toBe(108.5)
  })

  it('najbliži prethodni u okviru 7 dana', () => {
    seedRates([{ cur: 'USD', rate: 107, date: '2026-08-05' }])
    expect(getRate('USD', '2026-08-10')).toBe(107)
  })

  it('stariji kurs se i dalje vraća (izveštaj se ne blokira), ali usdConversion označava starost', () => {
    seedRates([{ cur: 'USD', rate: 99, date: '2025-01-01' }])
    expect(getRate('USD', '2026-08-10')).toBe(99)
  })

  it('bez ijednog kursa → null', () => {
    expect(getRate('USD', '2026-08-10')).toBe(null)
  })
})

describe('usdConversion', () => {
  it('USD → faktor 1', () => {
    expect(usdConversion('USD', '2026-08-10')).toMatchObject({ currency: 'USD', factor: 1, rateAvailable: true, rateStale: false })
  })

  it('RSD sa svežim kursom', () => {
    seedRates([{ cur: 'USD', rate: 108, date: '2026-08-10' }])
    expect(usdConversion('RSD', '2026-08-10')).toMatchObject({ currency: 'RSD', factor: 108, rateAvailable: true, rateStale: false, rateAgeDays: 0 })
  })

  it('RSD bez kursa → fallback na USD, rateAvailable=false', () => {
    expect(usdConversion('RSD', '2026-08-10')).toMatchObject({ currency: 'USD', factor: 1, rateAvailable: false })
  })

  it('EUR = USD/RSD ÷ EUR/RSD', () => {
    seedRates([
      { cur: 'USD', rate: 108, date: '2026-08-10' },
      { cur: 'EUR', rate: 117, date: '2026-08-10' },
    ])
    const c = usdConversion('EUR', '2026-08-10')
    expect(c.currency).toBe('EUR')
    expect(c.factor).toBeCloseTo(108 / 117)
    expect(c.rateAvailable).toBe(true)
  })

  it('EUR bez jednog od kurseva → fallback USD', () => {
    seedRates([{ cur: 'USD', rate: 108, date: '2026-08-10' }])
    expect(usdConversion('EUR', '2026-08-10').rateAvailable).toBe(false)
  })

  it('nepodržana valuta → fallback USD', () => {
    expect(usdConversion('JPY', '2026-08-10')).toMatchObject({ currency: 'USD', factor: 1, rateAvailable: false })
  })

  // [ISPRAVKA P1-8.12] zastareo kurs se i dalje koristi (izveštaj se ne blokira),
  // ali je vidljivo označen preko rateStale/rateAgeDays
  it('kurs star godinu dana → rateStale=true sa brojem dana', () => {
    seedRates([{ cur: 'USD', rate: 99, date: '2025-08-10' }])
    const c = usdConversion('RSD', '2026-08-10')
    expect(c.rateAvailable).toBe(true)
    expect(c.factor).toBe(99)
    expect(c.rateStale).toBe(true)
    expect(c.rateAgeDays).toBe(365)
  })

  it('kurs star 3 dana (vikend) nije stale', () => {
    seedRates([{ cur: 'USD', rate: 108, date: '2026-08-07' }])
    const c = usdConversion('RSD', '2026-08-10')
    expect(c.rateStale).toBe(false)
    expect(c.rateAgeDays).toBe(3)
  })

  it('EUR: starost je maksimum starosti oba kursa', () => {
    seedRates([
      { cur: 'USD', rate: 108, date: '2026-08-10' },
      { cur: 'EUR', rate: 117, date: '2026-06-01' },
    ])
    const c = usdConversion('EUR', '2026-08-10')
    expect(c.rateStale).toBe(true)
    expect(c.rateAgeDays).toBe(70)
  })
})

describe('fetchTodaysRates (mock fetch)', () => {
  it('upisuje kurseve, greška po valuti se prijavljuje bez rušenja', async () => {
    seedRates([])
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/eur/')) return { ok: false, status: 500 }
      return { ok: true, json: async () => ({ exchange_middle: 108.2, date: '2026-08-10' }) }
    }))
    const results = await fetchTodaysRates()
    const usd = results.find(r => r.cur === 'USD')
    expect(usd.rate).toBe(108.2)
    const eur = results.find(r => r.cur === 'EUR')
    expect(eur.error).toBeTruthy()
    expect(getRate('USD', '2026-08-10')).toBe(108.2)
    vi.unstubAllGlobals()
  })

  it('ponovni poziv za isti dan ažurira postojeći red (upsert)', async () => {
    seedRates([])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ exchange_middle: 110, date: '2026-08-10' }) })))
    await fetchTodaysRates()
    await fetchTodaysRates()
    const count = db.prepare("SELECT COUNT(*) c FROM ap_exchange_rates WHERE currency_from = 'USD'").get()
    expect(count.c).toBe(1)
    expect(getRate('USD', '2026-08-10')).toBe(110)
    vi.unstubAllGlobals()
  })
})
