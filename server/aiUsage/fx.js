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

// Kurs stariji od ovoga se i dalje koristi (izveštaj se ne blokira), ali se
// obeležava kao zastareo — "kurs star X dana, iznos okviran" (P1-8.12).
export const RATE_STALE_DAYS = 7

// Rate for a date: exact → nearest previous within 7 days → latest available.
// Vraća i datum kursa, da poziviac može da izračuna starost.
function getRateInfo(currencyFrom, dateIso) {
  const date = String(dateIso).slice(0, 10)
  const exact = db.prepare("SELECT rate, rate_date FROM ap_exchange_rates WHERE currency_from = ? AND currency_to = 'RSD' AND rate_date = ?").get(currencyFrom, date)
  if (exact?.rate > 0) return { rate: exact.rate, date: exact.rate_date }
  const prev = db.prepare(`
    SELECT rate, rate_date FROM ap_exchange_rates
    WHERE currency_from = ? AND currency_to = 'RSD' AND rate_date < ? AND rate_date >= date(?, '-7 days')
    ORDER BY rate_date DESC LIMIT 1
  `).get(currencyFrom, date, date)
  if (prev?.rate > 0) return { rate: prev.rate, date: prev.rate_date }
  const latest = db.prepare("SELECT rate, rate_date FROM ap_exchange_rates WHERE currency_from = ? AND currency_to = 'RSD' ORDER BY rate_date DESC LIMIT 1").get(currencyFrom)
  return latest?.rate > 0 ? { rate: latest.rate, date: latest.rate_date } : null
}

export function getRate(currencyFrom, dateIso) {
  return getRateInfo(currencyFrom, dateIso)?.rate ?? null
}

const ageDays = (rateDate, dateIso) => {
  const a = new Date(String(dateIso).slice(0, 10))
  const b = new Date(String(rateDate).slice(0, 10))
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(0, Math.round((a - b) / 86400000))
}

// USD → target currency factor at a given date (cross via RSD). Never show a
// wrong currency without a rate: fall back to USD with rate_available: false.
// Ako je najsvežiji kurs stariji od RATE_STALE_DAYS, konverzija se radi ali
// rezultat nosi rateStale/rateAgeDays da izveštaj prikaže upozorenje.
export function usdConversion(currency, dateIso) {
  const cur = String(currency || 'USD').toUpperCase()
  if (cur === 'USD') return { currency: 'USD', factor: 1, rateAvailable: true, rateStale: false, rateAgeDays: 0 }
  const usd = getRateInfo('USD', dateIso)
  const withStale = (out, ...infos) => {
    const age = Math.max(...infos.map(i => ageDays(i.date, dateIso)))
    return { ...out, rateStale: age > RATE_STALE_DAYS, rateAgeDays: age }
  }
  if (cur === 'RSD') {
    return usd
      ? withStale({ currency: 'RSD', factor: usd.rate, rateAvailable: true }, usd)
      : { currency: 'USD', factor: 1, rateAvailable: false, rateStale: false, rateAgeDays: null }
  }
  if (cur === 'EUR') {
    const eur = getRateInfo('EUR', dateIso)
    if (usd && eur) return withStale({ currency: 'EUR', factor: usd.rate / eur.rate, rateAvailable: true }, usd, eur)
    return { currency: 'USD', factor: 1, rateAvailable: false, rateStale: false, rateAgeDays: null }
  }
  return { currency: 'USD', factor: 1, rateAvailable: false, rateStale: false, rateAgeDays: null }
}
