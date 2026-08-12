// Zajednički format helperi (P2-A4). Ranije 5 kopija fmtDate i 2 kopije
// fmtTime po komponentama — svaka sa malo drugačijim ponašanjem. Varijante su
// nazvane po PONAŠANJU da svaki ekran zadrži identičan izgled kao pre.

// 'YYYY-MM-DD' (date-only ISO) → 'dd.mm.yyyy.' — bez Date parsiranja, bez zone.
export function fmtDateIso(iso, fallback = '—') {
  if (!iso) return fallback
  const [y, m, d] = String(iso).split('-')
  return `${d}.${m}.${y}.`
}

// Bilo koji parsabilan datum → 'dd.mm.yyyy.' (nule vođene). Nevalidan → fallback.
export function fmtDateAny(v, fallback = '—') {
  if (!v) return fallback
  const d = new Date(v)
  if (isNaN(d)) return fallback
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}.`
}

// Locale numerički prikaz ('12. 08. 2026.') — kao stari toLocaleDateString pozivi.
export function fmtDateNumericLocale(v, fallback = '—') {
  if (!v) return fallback
  return new Date(v).toLocaleDateString('sr-Latn-RS', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Dug prikaz sa imenom meseca ('12. avgust 2026.').
export function fmtDateLong(v, fallback = null) {
  if (!v) return fallback
  return new Date(v).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Relativno vreme ('upravo', 'pre 5 min'...). Posle 24h:
//  - absoluteAfterDay: true  → apsolutni datum+vreme (stil MessagesPage)
//  - absoluteAfterDay: false → 'pre N dana' (stil NotificationBell)
export function fmtRelativeTime(dateStr, t, { absoluteAfterDay = false } = {}) {
  const d = new Date(dateStr)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return t('time.justNow')
  if (diff < 3600) return t('time.minutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('time.hoursAgo', { n: Math.floor(diff / 3600) })
  if (absoluteAfterDay) {
    return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  return t('time.daysAgo', { n: Math.floor(diff / 86400) })
}
