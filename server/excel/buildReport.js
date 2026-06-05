// Builds a professional multi-sheet .xlsx project report.
// Input is the already-computed dashboard payload (WYSIWYG with the app UI),
// so there is no Jira/logic duplication here — this module only formats.

import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { donutSVG, columnSVG, hbarSVG, PALETTE } from './charts.js'

// ── Colors (ARGB) ───────────────────────────────────────────────────────────
const C = {
  accent: 'FF2563EB', green: 'FF16A34A', amber: 'FFD97706', red: 'FFDC2626',
  gray: 'FF94A3B8', text: 'FF0F1523', muted: 'FF5A6480', white: 'FFFFFFFF',
  border: 'FFE2E6F0', surfaceAlt: 'FFF1F5F9',
  greenTint: 'FFF0FDF4', redTint: 'FFFEF2F2', amberTint: 'FFFFFBEB', accentTint: 'FFEFF6FF',
  headerBg: 'FF0F1523',
}
const FONT = 'Segoe UI'
const HOURS_FMT = '0.0" h"'
const PCT_FMT = '0%'

const H = sec => Math.round(((sec || 0) / 3600) * 10) / 10

function fmtDate(iso) {
  const d = iso ? new Date(iso) : new Date()
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}.`
}

const CAT_LABEL = { done: 'Završeno', testing: 'Testing', inprog: 'In Progress', todo: 'To Do' }

async function svgToPng(svg) {
  return sharp(Buffer.from(svg), { density: 144 }).png().toBuffer()
}

function thinBorder() {
  const s = { style: 'thin', color: { argb: C.border } }
  return { top: s, left: s, bottom: s, right: s }
}

// Style a header row (dark band, white bold text)
function styleHeader(row) {
  row.eachCell(cell => {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = thinBorder()
  })
  row.height = 22
}

// ──────────────────────────────────────────────────────────────────────────
export async function buildProjectReport(payload) {
  const {
    meta = {}, totals = {}, tasks = [], assignees = [], components = [],
    modules = [], phases = [], hasBillableField = false,
  } = payload

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Jira Tracker'
  wb.created = new Date()

  const overTasks = tasks.filter(t => t.over)
  const billableSpent = tasks.filter(t => t.billable).reduce((s, t) => s + (t.spent || 0), 0)
  const diff = (totals.totalSpent || 0) - (totals.totalEst || 0)
  const diffPct = totals.totalEst > 0 ? diff / totals.totalEst : 0
  const donePct = totals.total > 0 ? totals.done / totals.total : 0

  // task -> phase name map
  const phaseOfTask = {}
  for (const ph of phases) for (const k of (ph.taskKeys || [])) phaseOfTask[k] = ph.name

  await buildDashboard(wb, { meta, totals, tasks, overTasks, phases, hasBillableField, billableSpent, diff, diffPct, donePct, assignees, modules })
  buildTasksSheet(wb, tasks, phaseOfTask, hasBillableField)
  buildPhasesSheet(wb, phases, tasks)
  buildAssigneeSheet(wb, assignees)
  buildBreakdownSheet(wb, modules, components)
  buildSubtaskSheet(wb, tasks)

  return wb.xlsx.writeBuffer()
}

// ── Sheet 1: Dashboard ──────────────────────────────────────────────────────
async function buildDashboard(wb, ctx) {
  const { meta, totals, overTasks, phases, hasBillableField, billableSpent, diff, diffPct, donePct, tasks } = ctx
  const ws = wb.addWorksheet('Dashboard', {
    properties: { tabColor: { argb: C.accent } },
    views: [{ showGridLines: false }],
  })

  // 12 working columns (B..M), gutter A
  ws.getColumn(1).width = 2
  for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 12

  // Title band
  ws.mergeCells('B2:M2')
  const title = ws.getCell('B2')
  title.value = 'INTELISALE  ·  Project Report'
  title.font = { name: FONT, size: 18, bold: true, color: { argb: C.accent } }
  ws.getRow(2).height = 26

  ws.mergeCells('B3:M3')
  const sub = ws.getCell('B3')
  sub.value = meta.projectName || meta.epicKey || 'Projekat'
  sub.font = { name: FONT, size: 22, bold: true, color: { argb: C.text } }
  ws.getRow(3).height = 30

  ws.mergeCells('B4:M4')
  const metaLine = ws.getCell('B4')
  const parts = []
  if (meta.epicKey) parts.push(meta.epicKey)
  if (meta.jiraUrl) parts.push(meta.jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))
  parts.push('Datum: ' + fmtDate(meta.generatedAt))
  if (meta.generatedBy) parts.push('Pripremio: ' + meta.generatedBy)
  metaLine.value = parts.join('   ·   ')
  metaLine.font = { name: FONT, size: 11, color: { argb: C.muted } }
  ws.getRow(4).height = 18

  // Health banner
  const healthy = overTasks.length === 0 && diff <= 0
  const atRisk = overTasks.length > 0 || diffPct > 0.1
  const hColor = healthy ? C.green : (atRisk ? C.red : C.amber)
  const hTint = healthy ? C.greenTint : (atRisk ? C.redTint : C.amberTint)
  const hText = healthy
    ? '🟢 Projekat je u okviru estimacije, bez prekoračenja'
    : (atRisk ? `🔴 Pažnja: ${overTasks.length} prekoračenja, utrošeno iznad estimacije` : '🟡 Projekat zahteva praćenje')
  ws.mergeCells('B6:M6')
  const hb = ws.getCell('B6')
  hb.value = hText
  hb.font = { name: FONT, size: 12, bold: true, color: { argb: hColor } }
  hb.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hTint } }
  hb.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(6).height = 26

  // KPI tiles — 4 per band, 2 columns wide each (B-C, E-F, H-I, K-L; gutters D,G,J,M)
  const tileCols = [2, 5, 8, 11]
  function tile(startCol, rowTop, label, value, subText, color) {
    const c1 = ws.getColumn(startCol).letter
    const c2 = ws.getColumn(startCol + 1).letter
    ws.mergeCells(`${c1}${rowTop}:${c2}${rowTop}`)
    ws.mergeCells(`${c1}${rowTop + 1}:${c2}${rowTop + 1}`)
    ws.mergeCells(`${c1}${rowTop + 2}:${c2}${rowTop + 2}`)
    const lab = ws.getCell(`${c1}${rowTop}`)
    lab.value = label
    lab.font = { name: FONT, size: 9, bold: true, color: { argb: C.muted } }
    lab.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    lab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.surfaceAlt } }
    const val = ws.getCell(`${c1}${rowTop + 1}`)
    val.value = value
    val.font = { name: FONT, size: 22, bold: true, color: { argb: color } }
    val.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.surfaceAlt } }
    const sb = ws.getCell(`${c1}${rowTop + 2}`)
    sb.value = subText
    sb.font = { name: FONT, size: 9, color: { argb: C.muted } }
    sb.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    sb.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.surfaceAlt } }
    // outline border around the tile
      ;[rowTop, rowTop + 1, rowTop + 2].forEach(r => {
        ;[startCol, startCol + 1].forEach(cc => {
          ws.getCell(r, cc).border = thinBorder()
        })
      })
    ws.getRow(rowTop).height = 16
    ws.getRow(rowTop + 1).height = 28
    ws.getRow(rowTop + 2).height = 15
  }

  const band1 = 8
  tile(tileCols[0], band1, 'UKUPNO TASKOVA', totals.total || 0, 'top-level taskovi', C.text)
  tile(tileCols[1], band1, 'ZAVRŠENO', `${totals.done || 0}  (${Math.round(donePct * 100)}%)`, `od ${totals.total || 0} ukupno`, C.green)
  tile(tileCols[2], band1, 'IN PROGRESS', totals.inprog || 0, 'aktivno u radu', C.accent)
  tile(tileCols[3], band1, 'TESTING / TODO', `${totals.testing || 0} / ${totals.todo || 0}`, 'testiranje · čeka', C.amber)

  const band2 = 12
  tile(tileCols[0], band2, 'ESTIMACIJA', H(totals.totalEst) + ' h', 'originalna procena', C.accent)
  tile(tileCols[1], band2, 'UTROŠENO', H(totals.totalSpent) + ' h', 'logovano vreme', C.text)
  tile(tileCols[2], band2, 'RAZLIKA', `${diff > 0 ? '+' : ''}${H(diff)} h`, `${diff > 0 ? '+' : ''}${Math.round(diffPct * 100)}% vs est.`, diff > 0 ? C.red : C.green)
  tile(tileCols[3], band2, 'PREKORAČENJA', overTasks.length, 'taskova > 15% preko', overTasks.length > 0 ? C.red : C.green)

  if (hasBillableField) {
    const billPct = totals.totalSpent > 0 ? Math.round((billableSpent / totals.totalSpent) * 100) : 0
    ws.mergeCells('B16:M16')
    const bc = ws.getCell('B16')
    bc.value = `Naplativi sati: ${H(billableSpent)} h od ${H(totals.totalSpent)} h  (${billPct}%)`
    bc.font = { name: FONT, size: 11, bold: true, color: { argb: C.text } }
    ws.getRow(16).height = 18
  }

  // ── Charts (images) ─────────────────────────────────────────────────────
  const donut = await svgToPng(donutSVG([
    { value: totals.done || 0, label: 'Završeno', color: PALETTE.green },
    { value: totals.testing || 0, label: 'Testing', color: PALETTE.amber },
    { value: totals.inprog || 0, label: 'In Progress', color: PALETTE.accent },
    { value: totals.todo || 0, label: 'To Do', color: PALETTE.grayLight },
  ], { centerLabel: Math.round(donePct * 100) + '%', centerSub: 'završeno' }))

  const colData = tasks
    .filter(t => (t.est || 0) > 0)
    .sort((a, b) => (b.est || 0) - (a.est || 0))
    .map(t => ({ label: t.key, est: t.est, spent: t.spent, over: t.over }))
  const columns = await svgToPng(columnSVG(colData))

  const chartRow = hasBillableField ? 18 : 17
  ws.mergeCells(`B${chartRow}:M${chartRow}`)
  ws.getCell(`B${chartRow}`).value = 'Distribucija statusa  ·  Estimacija vs Utrošeno (top taskovi)'
  ws.getCell(`B${chartRow}`).font = { name: FONT, size: 13, bold: true, color: { argb: C.text } }
  ws.getRow(chartRow).height = 20

  const donutId = wb.addImage({ buffer: donut, extension: 'png' })
  ws.addImage(donutId, { tl: { col: 1, row: chartRow }, ext: { width: 380, height: 240 }, editAs: 'oneCell' })
  const colId = wb.addImage({ buffer: columns, extension: 'png' })
  ws.addImage(colId, { tl: { col: 6.1, row: chartRow }, ext: { width: 460, height: 240 }, editAs: 'oneCell' })

  // ── Top overruns table ────────────────────────────────────────────────────
  let r = chartRow + 14
  if (overTasks.length) {
    ws.mergeCells(`B${r}:M${r}`)
    ws.getCell(`B${r}`).value = `Top prekoračenja (${overTasks.length})`
    ws.getCell(`B${r}`).font = { name: FONT, size: 13, bold: true, color: { argb: C.red } }
    r++
    const head = ws.getRow(r)
    head.getCell(2).value = 'Task'
    head.getCell(4).value = 'Naziv'
    head.getCell(10).value = 'Est'
    head.getCell(11).value = 'Utrošeno'
    head.getCell(12).value = 'Odstupanje'
    ws.mergeCells(`D${r}:I${r}`)
    styleHeader(head)
    r++
    overTasks.slice(0, 8).sort((a, b) => b.overPct - a.overPct).forEach(t => {
      const row = ws.getRow(r)
      row.getCell(2).value = t.key
      row.getCell(2).font = { name: FONT, size: 11, bold: true, color: { argb: C.accent } }
      ws.mergeCells(`D${r}:I${r}`)
      row.getCell(4).value = t.summary
      row.getCell(4).font = { name: FONT, size: 11, color: { argb: C.text } }
      row.getCell(4).alignment = { wrapText: false }
      row.getCell(10).value = H(t.est); row.getCell(10).numFmt = HOURS_FMT
      row.getCell(11).value = H(t.spent); row.getCell(11).numFmt = HOURS_FMT
      row.getCell(12).value = t.overPct / 100; row.getCell(12).numFmt = PCT_FMT
      row.getCell(12).font = { name: FONT, size: 11, bold: true, color: { argb: C.red } }
      ;[2, 10, 11, 12].forEach(c => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.redTint } } })
      r++
    })
  }
}

// ── Sheet 2: Taskovi ──────────────────────────────────────────────────────
function buildTasksSheet(wb, tasks, phaseOfTask, hasBillableField) {
  const ws = wb.addWorksheet('Taskovi', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1, showGridLines: false }] })
  const cols = [
    { header: 'Key', width: 13 },
    { header: 'Naziv', width: 50 },
    { header: 'Status', width: 18 },
    { header: 'Kategorija', width: 14 },
    { header: 'Faza', width: 18 },
    { header: 'Izvršilac', width: 20 },
    { header: 'Moduli', width: 22 },
    { header: 'Est (h)', width: 10 },
    { header: 'Utrošeno (h)', width: 12 },
    { header: 'Razlika (h)', width: 11 },
    { header: 'Odstupanje', width: 12 },
    { header: 'Naplativo', width: 10 },
    { header: '#Sub', width: 7 },
  ]
  ws.columns = cols.map(c => ({ width: c.width }))
  const header = ws.getRow(1)
  cols.forEach((c, i) => { header.getCell(i + 1).value = c.header })
  styleHeader(header)

  let r = 2
  for (const t of tasks) {
    const row = ws.getRow(r)
    row.getCell(1).value = t.key
    row.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: C.accent } }
    row.getCell(2).value = t.summary
    row.getCell(3).value = t.status
    row.getCell(4).value = CAT_LABEL[t.statusCategory] || t.statusCategory || ''
    row.getCell(5).value = phaseOfTask[t.key] || '—'
    row.getCell(6).value = t.assignee || '—'
    row.getCell(7).value = (t.modules || []).join(', ')
    row.getCell(8).value = H(t.est); row.getCell(8).numFmt = HOURS_FMT
    row.getCell(9).value = H(t.spent); row.getCell(9).numFmt = HOURS_FMT
    row.getCell(10).value = H(t.spent - t.est); row.getCell(10).numFmt = HOURS_FMT
    row.getCell(11).value = (t.est > 0) ? (t.overPct / 100) : 0; row.getCell(11).numFmt = PCT_FMT
    row.getCell(12).value = t.billable ? 'Da' : ''
    row.getCell(13).value = (t.subtasks || []).length

    row.eachCell({ includeEmpty: false }, cell => {
      cell.font = cell.font || { name: FONT, size: 11, color: { argb: C.text } }
      if (!cell.font.name) cell.font = { name: FONT, size: 11, color: { argb: C.text } }
      cell.alignment = cell.alignment || { vertical: 'middle' }
      cell.border = thinBorder()
    })
    if (t.over) {
      for (let c = 1; c <= 13; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.redTint } }
      row.getCell(11).font = { name: FONT, size: 11, bold: true, color: { argb: C.red } }
    }
    r++
  }

  // Totals row
  const totalRow = ws.getRow(r)
  totalRow.getCell(2).value = 'UKUPNO'
  totalRow.getCell(2).font = { name: FONT, size: 11, bold: true, color: { argb: C.text } }
  totalRow.getCell(8).value = { formula: `SUM(H2:H${r - 1})` }; totalRow.getCell(8).numFmt = HOURS_FMT
  totalRow.getCell(9).value = { formula: `SUM(I2:I${r - 1})` }; totalRow.getCell(9).numFmt = HOURS_FMT
  totalRow.getCell(10).value = { formula: `SUM(J2:J${r - 1})` }; totalRow.getCell(10).numFmt = HOURS_FMT
  totalRow.eachCell(cell => {
    cell.font = cell.font && cell.font.bold ? cell.font : { name: FONT, size: 11, bold: true, color: { argb: C.text } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.surfaceAlt } }
    cell.border = thinBorder()
  })

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 13 } }

  const lastData = r - 1
  if (lastData >= 2) {
    // data bars on Est & Utrošeno
    ws.addConditionalFormatting({
      ref: `H2:H${lastData}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: C.accent } }],
    })
    ws.addConditionalFormatting({
      ref: `I2:I${lastData}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: C.green } }],
    })
    // color scale on Odstupanje (green -> amber -> red)
    ws.addConditionalFormatting({
      ref: `K2:K${lastData}`,
      rules: [{
        type: 'colorScale',
        cfvo: [{ type: 'num', value: -0.25 }, { type: 'num', value: 0 }, { type: 'num', value: 0.5 }],
        color: [{ argb: C.green }, { argb: C.amber }, { argb: C.red }],
      }],
    })
  }
}

// ── Sheet 3: Po fazama ──────────────────────────────────────────────────────
function buildPhasesSheet(wb, phases, tasks) {
  const ws = wb.addWorksheet('Po fazama', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 24 }, { width: 50 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }]

  const taskMap = {}
  for (const t of tasks) taskMap[t.key] = t

  // Build phase groups (+ unassigned)
  const assigned = new Set()
  const groups = phases.map(ph => {
    const phTasks = (ph.taskKeys || []).map(k => taskMap[k]).filter(Boolean)
    phTasks.forEach(t => assigned.add(t.key))
    return { name: ph.name, due: ph.due_date, tasks: phTasks }
  })
  const unassigned = tasks.filter(t => !assigned.has(t.key))
  if (unassigned.length) groups.push({ name: 'Neraspoređeno', due: null, tasks: unassigned })

  // Summary table
  ws.getCell('A1').value = 'Pregled faza'
  ws.getCell('A1').font = { name: FONT, size: 15, bold: true, color: { argb: C.text } }
  ws.getRow(1).height = 22

  const sh = ws.getRow(2)
  ;['Faza', 'Rok', 'Taskova', 'Završeno', 'Est (h)', 'Utrošeno (h)', '% završeno'].forEach((h, i) => { sh.getCell(i + 1).value = h })
  ws.mergeCells('B2:B2')
  styleHeader(sh)

  let r = 3
  for (const g of groups) {
    const done = g.tasks.filter(t => t.statusCategory === 'done').length
    const est = g.tasks.reduce((s, t) => s + (t.est || 0), 0)
    const spent = g.tasks.reduce((s, t) => s + (t.spent || 0), 0)
    const pct = g.tasks.length > 0 ? done / g.tasks.length : 0
    const row = ws.getRow(r)
    row.getCell(1).value = g.name
    row.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: C.text } }
    row.getCell(2).value = g.due ? fmtDate(g.due) : '—'
    row.getCell(3).value = g.tasks.length
    row.getCell(4).value = done
    row.getCell(5).value = H(est); row.getCell(5).numFmt = HOURS_FMT
    row.getCell(6).value = H(spent); row.getCell(6).numFmt = HOURS_FMT
    row.getCell(7).value = pct; row.getCell(7).numFmt = PCT_FMT
    row.eachCell(cell => { cell.border = thinBorder(); if (!cell.font) cell.font = { name: FONT, size: 11, color: { argb: C.text } } })
    r++
  }
  const sumLast = r - 1
  if (sumLast >= 3) {
    ws.addConditionalFormatting({
      ref: `G3:G${sumLast}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: C.green } }],
    })
  }

  // Detailed per-phase task listing (grouped/collapsible)
  r += 1
  ws.getCell(`A${r}`).value = 'Taskovi po fazama'
  ws.getCell(`A${r}`).font = { name: FONT, size: 15, bold: true, color: { argb: C.text } }
  ws.getRow(r).height = 22
  r += 1

  for (const g of groups) {
    const gh = ws.getRow(r)
    gh.getCell(1).value = `▸ ${g.name}`
    gh.getCell(1).font = { name: FONT, size: 12, bold: true, color: { argb: C.white } }
    for (let c = 1; c <= 7; c++) {
      gh.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.accent } }
      gh.getCell(c).border = thinBorder()
    }
    gh.height = 20
    r++
    for (const t of g.tasks) {
      const row = ws.getRow(r)
      row.outlineLevel = 1
      row.getCell(1).value = t.key
      row.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: C.accent } }
      row.getCell(2).value = t.summary
      row.getCell(3).value = CAT_LABEL[t.statusCategory] || ''
      row.getCell(5).value = H(t.est); row.getCell(5).numFmt = HOURS_FMT
      row.getCell(6).value = H(t.spent); row.getCell(6).numFmt = HOURS_FMT
      row.eachCell(cell => { cell.border = thinBorder(); if (!cell.font) cell.font = { name: FONT, size: 11, color: { argb: C.text } } })
      r++
    }
  }
}

// ── Sheet 4: Po izvršiocu ──────────────────────────────────────────────────
function buildAssigneeSheet(wb, assignees) {
  const ws = wb.addWorksheet('Po izvršiocu', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
  ws.columns = [{ width: 26 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 12 }]
  const header = ws.getRow(1)
  ;['Izvršilac', 'Ukupno', 'Završeno', 'In Progress', 'To Do', 'Utrošeno (h)', '% od ukupno'].forEach((h, i) => { header.getCell(i + 1).value = h })
  styleHeader(header)

  const totalSpent = assignees.reduce((s, a) => s + (a.totalSpent || 0), 0)
  let r = 2
  for (const a of assignees) {
    const row = ws.getRow(r)
    row.getCell(1).value = a.name
    row.getCell(2).value = a.totalTasks || 0
    row.getCell(3).value = a.doneTasks || 0
    row.getCell(4).value = a.inprogTasks || 0
    row.getCell(5).value = a.todoTasks || 0
    row.getCell(6).value = H(a.totalSpent); row.getCell(6).numFmt = HOURS_FMT
    row.getCell(7).value = totalSpent > 0 ? (a.totalSpent / totalSpent) : 0; row.getCell(7).numFmt = PCT_FMT
    row.eachCell(cell => { cell.border = thinBorder(); if (!cell.font) cell.font = { name: FONT, size: 11, color: { argb: C.text } } })
    r++
  }
  const last = r - 1
  if (last >= 2) {
    ws.addConditionalFormatting({
      ref: `F2:F${last}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: C.accent } }],
    })
  }
}

// ── Sheet 5: Po modulu / komponenti ─────────────────────────────────────────
function buildBreakdownSheet(wb, modules, components) {
  const ws = wb.addWorksheet('Po modulu', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 30 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 4 }, { width: 30 }, { width: 14 }, { width: 10 }, { width: 12 }]

  function table(title, data, startCol) {
    const cl = n => ws.getColumn(n).letter
    ws.getCell(`${cl(startCol)}1`).value = title
    ws.getCell(`${cl(startCol)}1`).font = { name: FONT, size: 15, bold: true, color: { argb: C.text } }
    const header = ws.getRow(2)
    ;['Naziv', 'Utrošeno (h)', '#Tasks', '%'].forEach((h, i) => { header.getCell(startCol + i).value = h })
    for (let i = 0; i < 4; i++) {
      const cell = header.getCell(startCol + i)
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } }
      cell.border = thinBorder()
    }
    let r = 3
    for (const d of data) {
      const row = ws.getRow(r)
      row.getCell(startCol).value = d.name
      row.getCell(startCol + 1).value = H(d.totalSpent); row.getCell(startCol + 1).numFmt = HOURS_FMT
      row.getCell(startCol + 2).value = d.taskCount || 0
      row.getCell(startCol + 3).value = d.pct || 0; row.getCell(startCol + 3).numFmt = PCT_FMT
      for (let i = 0; i < 4; i++) {
        const cell = row.getCell(startCol + i)
        cell.border = thinBorder()
        if (!cell.font) cell.font = { name: FONT, size: 11, color: { argb: C.text } }
      }
      r++
    }
    const last = r - 1
    if (last >= 3) {
      const col = cl(startCol + 1)
      ws.addConditionalFormatting({
        ref: `${col}3:${col}${last}`,
        rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: C.accent } }],
      })
    }
  }

  table('Po modulu', modules, 1)
  table('Po komponenti', components, 6)
}

// ── Sheet 6: Subtaskovi (sirovo) ────────────────────────────────────────────
function buildSubtaskSheet(wb, tasks) {
  const ws = wb.addWorksheet('Subtaskovi', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
  ws.columns = [
    { width: 13 }, { width: 13 }, { width: 50 }, { width: 18 }, { width: 20 }, { width: 18 }, { width: 10 }, { width: 12 },
  ]
  const header = ws.getRow(1)
  ;['Parent', 'Subtask', 'Naziv', 'Status', 'Izvršilac', 'Komponente', 'Est (h)', 'Utrošeno (h)'].forEach((h, i) => { header.getCell(i + 1).value = h })
  styleHeader(header)

  let r = 2
  for (const t of tasks) {
    for (const sub of (t.subtasks || [])) {
      const row = ws.getRow(r)
      row.getCell(1).value = t.key
      row.getCell(2).value = sub.key
      row.getCell(2).font = { name: FONT, size: 11, bold: true, color: { argb: C.accent } }
      row.getCell(3).value = sub.summary
      row.getCell(4).value = sub.status
      row.getCell(5).value = sub.assignee || '—'
      row.getCell(6).value = (sub.components || []).join(', ')
      row.getCell(7).value = H(sub.timeoriginalestimate); row.getCell(7).numFmt = HOURS_FMT
      row.getCell(8).value = H(sub.timespent); row.getCell(8).numFmt = HOURS_FMT
      row.eachCell(cell => { cell.border = thinBorder(); if (!cell.font) cell.font = { name: FONT, size: 11, color: { argb: C.text } } })
      r++
    }
  }
  if (r > 2) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } }
}
