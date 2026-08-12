// Jedno mesto istine za rad sa date-only vrednostima (P1-8.7).
//
// `new Date('YYYY-MM-DD')` po specifikaciji parsira kao PONOĆ U UTC-u, pa u
// zonama iza UTC-a (i teoretski pri promeni serverske zone) lokalni datum
// sklizne za jedan dan. Zato se date-only stringovi UVEK parsiraju u lokalnu
// ponoć preko komponenti.

// 'YYYY-MM-DD' (ili puni ISO — uzima se samo datumski deo) → Date u lokalnoj ponoći.
export function parseLocalDate(iso) {
  const s = String(iso || '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return new Date(NaN)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

// Date → 'YYYY-MM-DD' po lokalnim komponentama (bez UTC konverzije).
export function toLocalIso(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
