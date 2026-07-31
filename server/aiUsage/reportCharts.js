// SVG chart builders for the AI usage report (money/token oriented).
// The same strings are (a) rasterized to PNG for Excel and (b) inlined into
// the HTML/PDF report, so both outputs look identical.

export const P = {
  navy: '#0F2746', accent: '#2563EB', cyan: '#0EA5E9', violet: '#7C3AED',
  green: '#16A34A', amber: '#D97706', red: '#DC2626', teal: '#0D9488',
  text: '#0F1523', muted: '#5A6480', border: '#E2E6F0', surface: '#F8F9FC',
}
export const SERIES = [P.accent, P.cyan, P.violet, P.green, P.amber, P.red, P.teal, '#D946EF', '#059669', '#64748B']
const FONT = 'Inter'

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const nice = v => { if (v <= 0) return 1; const e = Math.floor(Math.log10(v)), b = 10 ** e, f = v / b; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * b }

const empty = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
  + `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${P.muted}">Nema podataka</text></svg>`

// ── Donut with legend ─────────────────────────────────────────────────────────
export function donut(items, { width = 460, height = 250, center = '', centerSub = '', fmt = v => v, max = 7 } = {}) {
  const all = (items || []).filter(i => (i.value || 0) > 0).sort((a, b) => b.value - a.value)
  if (!all.length) return empty(width, height)
  const top = all.slice(0, max)
  const rest = all.slice(max).reduce((s, i) => s + i.value, 0)
  const segs = rest > 0 ? [...top, { label: 'Ostalo', value: rest }] : top
  const total = segs.reduce((s, i) => s + i.value, 0)

  const cx = 112, cy = height / 2, r = 78, sw = 28, C = 2 * Math.PI * r
  let off = 0, arcs = ''
  segs.forEach((s, i) => {
    const len = (s.value / total) * C
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color || SERIES[i % SERIES.length]}" stroke-width="${sw}"`
      + ` stroke-dasharray="${Math.max(0, len - 2).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`
    off += len
  })
  const legendX = cx + r + sw / 2 + 22
  const rowH = Math.min(24, (height - 24) / segs.length)
  const legend = segs.map((s, i) => {
    const y = 18 + i * rowH
    return `<rect x="${legendX}" y="${y - 8}" width="9" height="9" rx="2" fill="${s.color || SERIES[i % SERIES.length]}"/>`
      + `<text x="${legendX + 15}" y="${y}" font-family="${FONT}" font-size="11" fill="${P.text}">${esc(cut(s.label, 26))}</text>`
      + `<text x="${width - 10}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${P.muted}">${esc(fmt(s.value))} · ${Math.round(s.value / total * 100)}%</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="none"/>${arcs}`
    + (center ? `<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="bold" fill="${P.text}">${esc(center)}</text>` : '')
    + (centerSub ? `<text x="${cx}" y="${cy + 19}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${P.muted}">${esc(centerSub)}</text>` : '')
    + legend + `</svg>`
}

// ── Daily trend: cost area/line + request bars ────────────────────────────────
export function trend(days, { width = 900, height = 260, currency = 'EUR', moneyFmt = v => String(v) } = {}) {
  const rows = days || []
  if (!rows.length) return empty(width, height)
  const padL = 62, padR = 58, padT = 22, padB = 40
  const plotW = width - padL - padR, plotH = height - padT - padB
  const maxCost = nice(Math.max(...rows.map(d => d.cost || 0), 1e-6))
  const maxReq = nice(Math.max(...rows.map(d => d.requests || 0), 1))
  const x = i => padL + (rows.length === 1 ? plotW / 2 : (plotW * i) / (rows.length - 1))
  const yc = v => padT + plotH - (v / maxCost) * plotH
  const bw = Math.max(2, Math.min(18, plotW / rows.length - 3))

  let grid = '', bars = ''
  for (let k = 0; k <= 4; k++) {
    const y = padT + (plotH * k) / 4
    grid += `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${P.border}" stroke-width="1"/>`
      + `<text x="${padL - 7}" y="${y + 4}" text-anchor="end" font-family="${FONT}" font-size="10" fill="${P.muted}">${esc(moneyFmt(maxCost * (1 - k / 4)))}</text>`
      + `<text x="${width - padR + 7}" y="${y + 4}" font-family="${FONT}" font-size="10" fill="${P.muted}">${Math.round(maxReq * (1 - k / 4))}</text>`
  }
  rows.forEach((d, i) => {
    const h = ((d.requests || 0) / maxReq) * plotH
    bars += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(padT + plotH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${P.cyan}" opacity="0.32" rx="1.5"/>`
  })
  const pts = rows.map((d, i) => `${x(i).toFixed(1)},${yc(d.cost || 0).toFixed(1)}`).join(' ')
  const step = Math.max(1, Math.ceil(rows.length / 12))
  const labels = rows.map((d, i) => (i % step === 0 || i === rows.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${height - 16}" text-anchor="middle" font-family="${FONT}" font-size="9.5" fill="${P.muted}">${esc(String(d.date).slice(5))}</text>` : '').join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<text x="${padL}" y="14" font-family="${FONT}" font-size="10" fill="${P.accent}">■ trošak (${esc(currency)})</text>`
    + `<text x="${padL + 120}" y="14" font-family="${FONT}" font-size="10" fill="${P.cyan}">■ zahtevi</text>`
    + grid + bars
    + `<polygon points="${padL},${padT + plotH} ${pts} ${padL + plotW},${padT + plotH}" fill="${P.accent}" opacity="0.10"/>`
    + `<polyline points="${pts}" fill="none" stroke="${P.accent}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
    + labels + `</svg>`
}

// ── Horizontal ranked bars ────────────────────────────────────────────────────
export function hbars(items, { width = 460, color = P.accent, fmt = v => v, max = 8, labelW = 165 } = {}) {
  const data = (items || []).filter(i => (i.value || 0) > 0).sort((a, b) => b.value - a.value).slice(0, max)
  if (!data.length) return empty(width, 90)
  const rowH = 26, padT = 8, height = padT * 2 + data.length * rowH
  const valW = 86, barMax = width - labelW - valW - 12
  const peak = Math.max(...data.map(d => d.value), 1)
  const rows = data.map((d, i) => {
    const cy = padT + i * rowH + rowH / 2
    const bw = Math.max(2, (d.value / peak) * barMax)
    return `<text x="0" y="${cy + 4}" font-family="${FONT}" font-size="11" fill="${P.text}">${esc(cut(d.label, 30))}</text>`
      + `<rect x="${labelW}" y="${cy - 6}" width="${barMax}" height="12" rx="6" fill="${P.border}" opacity="0.55"/>`
      + `<rect x="${labelW}" y="${cy - 6}" width="${bw.toFixed(1)}" height="12" rx="6" fill="${d.color || color}"/>`
      + `<text x="${width}" y="${cy + 4}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${P.muted}">${esc(fmt(d.value))}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rows}</svg>`
}

// ── Period comparison: grouped bars (current vs previous) ─────────────────────
export function compareBars(items, { width = 460, height = 240, fmt = v => v, labels = ['Tekući', 'Prethodni'] } = {}) {
  const data = (items || []).slice(0, 6)
  if (!data.length) return empty(width, height)
  const padL = 8, padT = 26, padB = 46, plotH = height - padT - padB
  const groupW = (width - padL - 8) / data.length
  const bw = Math.min(26, groupW / 2.6)
  const peak = nice(Math.max(...data.flatMap(d => [d.now || 0, d.prev || 0]), 1e-6))
  const y = v => padT + plotH - (v / peak) * plotH
  const bars = data.map((d, i) => {
    const cx = padL + groupW * i + groupW / 2
    const b = (v, dx, color) => `<rect x="${(cx + dx).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(padT + plotH - y(v)).toFixed(1)}" fill="${color}" rx="2"/>`
    return b(d.now || 0, -bw - 2, P.accent) + b(d.prev || 0, 2, '#94A3B8')
      + `<text x="${cx}" y="${padT + plotH + 14}" text-anchor="middle" font-family="${FONT}" font-size="9.5" fill="${P.muted}">${esc(cut(d.label, 14))}</text>`
      + `<text x="${cx}" y="${padT + plotH + 27}" text-anchor="middle" font-family="${FONT}" font-size="9" fill="${P.text}">${esc(fmt(d.now || 0))}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<text x="${padL}" y="12" font-family="${FONT}" font-size="10" fill="${P.accent}">■ ${esc(labels[0])}</text>`
    + `<text x="${padL + 90}" y="12" font-family="${FONT}" font-size="10" fill="#94A3B8">■ ${esc(labels[1])}</text>`
    + bars + `</svg>`
}

// ── Budget gauge (spent vs limit, with projection marker) ─────────────────────
export function gauge(rows, { width = 460, fmt = v => v } = {}) {
  const data = (rows || []).slice(0, 10)
  if (!data.length) return empty(width, 80)
  const rowH = 40, padT = 8, height = padT * 2 + data.length * rowH
  const barX = 0, barW = width
  const out = data.map((d, i) => {
    const top = padT + i * rowH
    const pct = Math.min(100, Math.max(0, d.pct || 0))
    const color = pct >= 100 ? P.red : pct >= (d.warnAt || 80) ? P.amber : P.green
    const projPct = d.projPct != null ? Math.min(100, d.projPct) : null
    return `<text x="0" y="${top + 12}" font-family="${FONT}" font-size="11" font-weight="bold" fill="${P.text}">${esc(cut(d.label, 30))}</text>`
      + `<text x="${width}" y="${top + 12}" text-anchor="end" font-family="${FONT}" font-size="10.5" fill="${color}">${esc(fmt(d.spent))} / ${esc(fmt(d.limit))} · ${Math.round(d.pct || 0)}%</text>`
      + `<rect x="${barX}" y="${top + 20}" width="${barW}" height="11" rx="5.5" fill="${P.border}"/>`
      + `<rect x="${barX}" y="${top + 20}" width="${(barW * pct / 100).toFixed(1)}" height="11" rx="5.5" fill="${color}"/>`
      + (projPct != null ? `<line x1="${(barW * projPct / 100).toFixed(1)}" y1="${top + 17}" x2="${(barW * projPct / 100).toFixed(1)}" y2="${top + 34}" stroke="${P.navy}" stroke-width="2" stroke-dasharray="2 2"/>` : '')
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${out}</svg>`
}
