// NBS middle exchange rates via kurs.resenje.org (spec §6). USD is the
// internal currency; conversion happens only at report level, at period end.

import db from '../db.js'

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP']

export async function fetchTodaysRates() {
  const results = []
  for (const cur of CURRENCIES) {
    try {
      const res = await fetch(`https://kurs.resenje.org/api/v1/currencies/${cur.toLowerCase()}/rates/today`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      const rate = Number(d.exchange_middle)
      const date = String(d.date || new Date().toISOString().slice(0, 10)).slice(0, 10)
      if (rate > 0) {
        db.prepare(`
          INSERT INTO ap_exchange_rates (currency_from, currency_to, rate, rate_date, source)
          VALUES (?, 'RSD', ?, ?, 'nbs_kurs_resenje')
          ON CONFLICT (currency_from, currency_to, rate_date) DO UPDATE SET rate = excluded.rate
        `).run(cur, rate, date)
        results.push({ cur, rate, date })
      }
    } catch (e) {
      results.push({ cur, error: String(e.message || e) })
    }
  }
  return results
}

// Rate for a date: exact → nearest previous within 7 days → latest available.
export function getRate(currencyFrom, dateIso) {
  const date = String(dateIso).slice(0, 10)
  const exact = db.prepare("SELECT rate FROM ap_exchange_rates WHERE currency_from = ? AND currency_to = 'RSD' AND rate_date = ?").get(currencyFrom, date)
  if (exact?.rate > 0) return exact.rate
  const prev = db.prepare(`
    SELECT rate FROM ap_exchange_rates
    WHERE currency_from = ? AND currency_to = 'RSD' AND rate_date < ? AND rate_date >= date(?, '-7 days')
    ORDER BY rate_date DESC LIMIT 1
  `).get(currencyFrom, date, date)
  if (prev?.rate > 0) return prev.rate
  const latest = db.prepare("SELECT rate FROM ap_exchange_rates WHERE currency_from = ? AND currency_to = 'RSD' ORDER BY rate_date DESC LIMIT 1").get(currencyFrom)
  return latest?.rate > 0 ? latest.rate : null
}

// USD → target currency factor at a given date (cross via RSD). Never show a
// wrong currency without a rate: fall back to USD with rate_available: false.
export function usdConversion(currency, dateIso) {
  const cur = String(currency || 'USD').toUpperCase()
  if (cur === 'USD') return { currency: 'USD', factor: 1, rateAvailable: true }
  const usdRsd = getRate('USD', dateIso)
  if (cur === 'RSD') {
    return usdRsd ? { currency: 'RSD', factor: usdRsd, rateAvailable: true } : { currency: 'USD', factor: 1, rateAvailable: false }
  }
  if (cur === 'EUR') {
    const eurRsd = getRate('EUR', dateIso)
    if (usdRsd && eurRsd) return { currency: 'EUR', factor: usdRsd / eurRsd, rateAvailable: true }
    return { currency: 'USD', factor: 1, rateAvailable: false }
  }
  return { currency: 'USD', factor: 1, rateAvailable: false }
}
