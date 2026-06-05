// Pure SVG chart builders for the Excel project report.
// No external deps — return SVG strings that are rasterized to PNG (via sharp)
// before being embedded into the workbook. Fonts kept generic (sans-serif)
// because the rasterizer relies on system fonts, not the app's web fonts.

export const PALETTE = {
  green: '#16A34A',
  amber: '#D97706',
  accent: '#2563EB',
  gray: '#94A3B8',
  grayLight: '#CBD5E1',
  red: '#DC2626',
  text: '#0F1523',
  muted: '#5A6480',
  border: '#E2E6F0',
  surfaceAlt: '#F8F9FC',
}

const FONT = 'Segoe UI, Arial, sans-serif'

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s, max) {
  s = String(s ?? '')
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Round a value up to a "nice" number (1, 2, 5 × 10^k) for axis ticks.
function niceCeil(v) {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const f = v / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * base
}

function emptySVG(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${PALETTE.muted}">Nema podataka</text></svg>`
}

// ── Donut: status distribution ─────────────────────────────────────────────
// segments: [{ value, label, color }]
export function donutSVG(segments, { width = 380, height = 240, centerLabel = '', centerSub = '' } = {}) {
  const segs = (segments || []).filter(s => s && s.value > 0)
  const total = segs.reduce((s, x) => s + x.value, 0)
  const cx = 120, cy = height / 2, r = 80, sw = 30
  const C = 2 * Math.PI * r

  let arcs = ''
  if (total > 0) {
    let off = 0
    for (const seg of segs) {
      const dash = (seg.value / total) * C
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}" ` +
        `stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" ` +
        `transform="rotate(-90 ${cx} ${cy})"/>`
      off += dash
    }
  } else {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PALETTE.border}" stroke-width="${sw}"/>`
  }

  const center = centerLabel
    ? `<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="700" fill="${PALETTE.text}">${esc(centerLabel)}</text>` +
      `<text x="${cx}" y="${cy + 19}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${PALETTE.muted}">${esc(centerSub)}</text>`
    : ''

  // Legend (right side)
  const allSegs = segments || []
  let ly = cy - (allSegs.length * 22) / 2 + 7
  let lg = ''
  for (const seg of allSegs) {
    const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
    lg += `<rect x="248" y="${(ly - 10).toFixed(1)}" width="11" height="11" rx="2" fill="${seg.color}"/>`
    lg += `<text x="266" y="${ly.toFixed(1)}" font-family="${FONT}" font-size="12" fill="${PALETTE.text}">${esc(seg.label)}</text>`
    lg += `<text x="${width - 12}" y="${ly.toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="12" font-weight="700" fill="${PALETTE.muted}">${seg.value} · ${pct}%</text>`
    ly += 22
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${arcs}${center}${lg}</svg>`
}

// ── Grouped columns: estimate vs spent (per task) ──────────────────────────
// items: [{ label, est, spent, over }] — values in seconds
export function columnSVG(items, { width = 660, height = 300 } = {}) {
  const data = (items || []).slice(0, 12)
  if (!data.length) return emptySVG(width, height)

  const padL = 42, padR = 14, padT = 28, padB = 70
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const baseline = padT + plotH

  const maxV = Math.max(...data.flatMap(d => [d.est || 0, d.spent || 0]), 1)
  const niceMaxH = niceCeil(maxV / 3600)
  const niceMax = niceMaxH * 3600
  const y = v => padT + plotH - (v / niceMax) * plotH

  const groupW = plotW / data.length
  const barW = Math.min(16, groupW / 3)

  // gridlines + y labels (hours)
  let grid = ''
  const ticks = 4
  for (let i = 0; i <= ticks; i++) {
    const val = (niceMax * i) / ticks
    const yy = padT + plotH - (val / niceMax) * plotH
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${width - padR}" y2="${yy.toFixed(1)}" stroke="${PALETTE.border}" stroke-width="1"/>`
    grid += `<text x="${padL - 6}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="10" fill="${PALETTE.muted}">${Math.round(val / 3600)}</text>`
  }

  let bars = ''
  data.forEach((d, i) => {
    const gx = padL + groupW * i + groupW / 2
    const ex = gx - barW - 1
    const sx = gx + 1
    const eY = y(d.est || 0)
    const sY = y(d.spent || 0)
    bars += `<rect x="${ex.toFixed(1)}" y="${eY.toFixed(1)}" width="${barW}" height="${Math.max(0, baseline - eY).toFixed(1)}" fill="${PALETTE.accent}" rx="2"/>`
    bars += `<rect x="${sx.toFixed(1)}" y="${sY.toFixed(1)}" width="${barW}" height="${Math.max(0, baseline - sY).toFixed(1)}" fill="${d.over ? PALETTE.red : PALETTE.green}" rx="2"/>`
    bars += `<text x="${gx.toFixed(1)}" y="${baseline + 14}" transform="rotate(45 ${gx.toFixed(1)} ${baseline + 14})" font-family="${FONT}" font-size="9" fill="${PALETTE.muted}">${esc(truncate(d.label, 14))}</text>`
  })

  // legend (top-right)
  const lgItems = [
    { c: PALETTE.accent, t: 'Estimacija' },
    { c: PALETTE.green, t: 'Utrošeno' },
    { c: PALETTE.red, t: 'Prekoračenje' },
  ]
  let lx = width - padR
  let legend = ''
  for (let i = lgItems.length - 1; i >= 0; i--) {
    const it = lgItems[i]
    const w = it.t.length * 6.2 + 22
    lx -= w
    legend += `<rect x="${lx.toFixed(1)}" y="8" width="10" height="10" rx="2" fill="${it.c}"/>`
    legend += `<text x="${(lx + 15).toFixed(1)}" y="17" font-family="${FONT}" font-size="11" fill="${PALETTE.muted}">${esc(it.t)}</text>`
    lx -= 8
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${grid}${bars}${legend}</svg>`
}

// ── Horizontal bars: distribution (modules / assignees) ────────────────────
// items: [{ label, value, sub }] — value in seconds, sub optional right-side text
export function hbarSVG(items, { width = 660, color = PALETTE.accent } = {}) {
  const data = (items || []).slice(0, 12)
  if (!data.length) return emptySVG(width, 80)

  const rowH = 28, padT = 10, padB = 10
  const height = padT + padB + data.length * rowH
  const labelW = 170, valW = 96
  const barMaxW = width - labelW - valW - 16
  const maxV = Math.max(...data.map(d => d.value || 0), 1)

  let rows = ''
  data.forEach((d, i) => {
    const yTop = padT + i * rowH
    const cy = yTop + rowH / 2
    const bw = Math.max(2, (d.value / maxV) * barMaxW)
    const hours = ((d.value || 0) / 3600).toFixed(1) + 'h'
    rows += `<text x="0" y="${(cy + 4).toFixed(1)}" font-family="${FONT}" font-size="12" fill="${PALETTE.text}">${esc(truncate(d.label, 26))}</text>`
    rows += `<rect x="${labelW}" y="${(cy - 8).toFixed(1)}" width="${barMaxW}" height="16" rx="3" fill="${PALETTE.surfaceAlt}"/>`
    rows += `<rect x="${labelW}" y="${(cy - 8).toFixed(1)}" width="${bw.toFixed(1)}" height="16" rx="3" fill="${color}"/>`
    rows += `<text x="${width}" y="${(cy + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="700" fill="${PALETTE.muted}">${esc(hours)}${d.sub ? ' · ' + esc(d.sub) : ''}</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rows}</svg>`
}
