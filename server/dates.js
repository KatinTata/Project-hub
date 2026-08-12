// Jedno mesto istine za datume na serveru (P1-8.7).
// Konvencija: "dan" znači kalendarski dan u Europe/Belgrade, nezavisno od
// toga u kojoj zoni radi server (Railway = UTC).

const BELGRADE = 'Europe/Belgrade'

const dayFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: BELGRADE, year: 'numeric', month: '2-digit', day: '2-digit',
})

// Bilo koji parsabilan datum/ISO string → 'YYYY-MM-DD' u Europe/Belgrade.
// Nevalidan ulaz → null (poziviocu ostaje da odluči fallback).
export function dayInBelgrade(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (Number.isNaN(d.getTime())) return null
  return dayFmt.format(d) // sv-SE locale daje ISO oblik YYYY-MM-DD
}

// 'YYYY-MM-DD' → Date za PONOĆ tog dana u Europe/Belgrade.
export function startOfDayBelgrade(dayIso) {
  const m = String(dayIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  // Probaj obe moguće zimsko/letnje pomeranja (+01:00 / +02:00) i zadrži onu
  // čiji se beogradski dan poklapa — bez eksternih tz biblioteka.
  for (const off of ['+02:00', '+01:00']) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00${off}`)
    if (dayInBelgrade(d) === `${m[1]}-${m[2]}-${m[3]}`) return d
  }
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+01:00`)
}

// 'YYYY-MM-DD' → Date za KRAJ tog dana (23:59:59.999) u Europe/Belgrade.
export function endOfDayBelgrade(dayIso) {
  const start = startOfDayBelgrade(dayIso)
  if (!start) return null
  return new Date(start.getTime() + 24 * 3600 * 1000 - 1)
}
