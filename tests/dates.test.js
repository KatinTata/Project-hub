// Testovi za date helpere (P1-8.7) — klijentski i serverski.

import { describe, it, expect } from 'vitest'
import { parseLocalDate, toLocalIso } from '../client/src/utils/dates.js'
import { dayInBelgrade, startOfDayBelgrade, endOfDayBelgrade } from '../server/dates.js'

describe('parseLocalDate (klijent)', () => {
  it('parsira YYYY-MM-DD u LOKALNU ponoć (ne UTC)', () => {
    const d = parseLocalDate('2026-08-10')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(10)
    expect(d.getHours()).toBe(0)
  })

  it('seče puni ISO na datumski deo', () => {
    expect(parseLocalDate('2026-08-10T15:30:00Z').getDate()).toBe(10)
  })

  it('nevalidan ulaz → Invalid Date', () => {
    expect(Number.isNaN(parseLocalDate('nije datum').getTime())).toBe(true)
    expect(Number.isNaN(parseLocalDate(null).getTime())).toBe(true)
  })

  it('toLocalIso je inverz parseLocalDate', () => {
    expect(toLocalIso(parseLocalDate('2026-02-01'))).toBe('2026-02-01')
  })
})

describe('dayInBelgrade (server)', () => {
  it('normalizuje zonu autora na beogradski dan', () => {
    // 23:30 u UTC+5 = 20:30 u Beogradu (leto, +02:00) → isti dan
    expect(dayInBelgrade('2026-08-10T23:30:00+05:00')).toBe('2026-08-10')
    // 01:00 u UTC+5 = 22:00 prethodnog dana u Beogradu
    expect(dayInBelgrade('2026-08-10T01:00:00+05:00')).toBe('2026-08-09')
  })

  it('zimsko vreme (+01:00)', () => {
    // 00:30 u UTC+2 zimi = 23:30 prethodnog dana u Beogradu (+01:00)
    expect(dayInBelgrade('2026-01-15T00:30:00+02:00')).toBe('2026-01-14')
  })

  it('UTC ponoć leti ostaje isti dan (Beograd je ispred)', () => {
    expect(dayInBelgrade('2026-08-10T00:00:00Z')).toBe('2026-08-10')
  })

  it('nevalidan ulaz → null', () => {
    expect(dayInBelgrade('nije datum')).toBe(null)
  })
})

describe('startOfDayBelgrade / endOfDayBelgrade (server)', () => {
  it('start je ponoć tog dana u Beogradu', () => {
    const d = startOfDayBelgrade('2026-08-10')
    expect(dayInBelgrade(d)).toBe('2026-08-10')
    expect(dayInBelgrade(new Date(d.getTime() - 1))).toBe('2026-08-09')
  })

  it('end je poslednji milisekund dana u Beogradu', () => {
    const d = endOfDayBelgrade('2026-08-10')
    expect(dayInBelgrade(d)).toBe('2026-08-10')
    expect(dayInBelgrade(new Date(d.getTime() + 1))).toBe('2026-08-11')
  })

  it('radi i zimi', () => {
    const d = startOfDayBelgrade('2026-01-15')
    expect(dayInBelgrade(d)).toBe('2026-01-15')
    expect(dayInBelgrade(new Date(d.getTime() - 1))).toBe('2026-01-14')
  })
})
