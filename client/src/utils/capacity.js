// Sloj 3 — window-based capacity feasibility + overallocation.
// Each phase that has BOTH a start and due date defines a window. We compare
// the working-day capacity in that window (per stack) against the demand
// (effort), and detect people booked across overlapping phase windows.

import { buildStackMatrix, buildStackTeams, normalizeStack, remainingOf, STACKS } from './stacks.js'
import { parseLocalDate } from './dates.js'
import { getCalcConfig } from './calcConfig.js'

const mondayIdx = d => (d.getDay() + 6) % 7
const isWorking = (d, wdpw) => mondayIdx(d) < wdpw

function countWorkingDays(startIso, dueIso, wdpw) {
  if (!startIso || !dueIso) return 0
  const s = parseLocalDate(startIso)
  const e = parseLocalDate(dueIso)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0
  let n = 0, guard = 0
  const d = new Date(s)
  while (d <= e && guard++ < 4000) { if (isWorking(d, wdpw)) n++; d.setDate(d.getDate() + 1) }
  return n
}

const STATUS_RANK = { over: 6, nocapacity: 5, nostaff: 4, tight: 3, nowindow: 2, ok: 1, none: 0 }
function worstStatus(cells) {
  let w = 'none'
  for (const s of STACKS) if (STATUS_RANK[cells[s].status] > STATUS_RANK[w]) w = cells[s].status
  return w
}

export function buildCapacity(tasks, phases, config, opts = {}) {
  const wdh = config?.workdayHours > 0 ? config.workdayHours : 6.5
  const wdpw = config?.workdaysPerWeek >= 1 && config?.workdaysPerWeek <= 7 ? config.workdaysPerWeek : 5
  const basis = opts.basis === 'plan' ? 'plan' : 'remaining'
  // Demand mirrors the forecast: status-aware remaining (precomputed per cell).
  const demandOf = c => basis === 'plan' ? c.plan : (c.remaining || 0)

  const matrix = buildStackMatrix(tasks || [], phases || [])
  const teams = buildStackTeams(tasks || [], phases || [])
  const phaseList = (phases || []).map(p => ({ id: String(p.id), name: p.name, start: p.start_date || null, due: p.due_date || null }))

  // ── Per-phase × stack feasibility ─────────────────────────────────────────
  const rows = phaseList.map(p => {
    const hasWindow = !!(p.start && p.due)
    const W = hasWindow ? countWorkingDays(p.start, p.due, wdpw) : 0
    const mRow = matrix.rows.find(r => r.phaseId === p.id)
    const roster = opts.peoplePerStack || null
    const cells = {}
    for (const s of STACKS) {
      const demand = mRow ? demandOf(mRow.cells[s]) : 0
      const people = (roster && roster[s] !== undefined) ? roster[s] : (teams.phaseStack[p.id]?.[s]?.realCount || 0)
      const capacity = hasWindow ? W * people * wdh * 3600 : 0
      let status
      if (demand <= 0) status = 'none'
      else if (!hasWindow) status = 'nowindow'
      else if (people === 0) status = 'nostaff'
      // Prozor bez ijednog radnog dana → capacity 0; demand/0 bi dao Infinity
      // i lažni "over" bez broja (P1-8.5). Zaseban status sa jasnom porukom.
      else if (capacity <= 0) status = 'nocapacity'
      else {
        const load = demand / capacity
        const tight = getCalcConfig().capacityTightPct / 100
        status = load > 1 ? 'over' : load > tight ? 'tight' : 'ok'
      }
      cells[s] = { demand, capacity, people, load: capacity > 0 ? demand / capacity : null, status }
    }
    return { phaseId: p.id, name: p.name, start: p.start, due: p.due, hasWindow, workingDays: W, cells, worst: worstStatus(cells) }
  })

  // ── Overallocation across overlapping windows ─────────────────────────────
  const phaseOf = {}
  for (const p of (phases || [])) for (const k of (p.taskKeys || [])) phaseOf[k] = String(p.id)
  const windowById = {}
  for (const p of phaseList) windowById[p.id] = p

  // person → phaseId → demand seconds
  const pp = {}
  const addPP = (name, pid, est, spent, statusCat) => {
    const dem = basis === 'plan' ? est : remainingOf(statusCat, est, spent)
    if (dem <= 0 || !name || name === 'Neraspoređeno') return
    if (!pp[name]) pp[name] = {}
    pp[name][pid] = (pp[name][pid] || 0) + dem
  }
  for (const task of (tasks || [])) {
    const pid = phaseOf[task.key] || 'none'
    const subs = task.subtasks || []
    const subEst = subs.reduce((a, x) => a + (x.timeoriginalestimate || 0), 0)
    const subSpent = subs.reduce((a, x) => a + (x.timespent || 0), 0)
    addPP(task.assignee, pid, Math.max(0, (task.est || 0) - subEst), Math.max(0, (task.spent || 0) - subSpent), task.statusCategory)
    for (const sub of subs) addPP(sub.assignee || task.assignee, pid, sub.timeoriginalestimate || 0, sub.timespent || 0, sub.statusCategory)
  }

  const warnings = []
  for (const name of Object.keys(pp)) {
    const entries = Object.entries(pp[name])
      .map(([pid, dem]) => {
        const w = windowById[pid]
        if (!w || !w.start || !w.due) return null
        const days = countWorkingDays(w.start, w.due, wdpw)
        if (days <= 0) return null
        return { pid, name: w.name, start: w.start, due: w.due, perDay: (dem / 3600) / days }
      })
      .filter(Boolean)
    if (entries.length < 2) continue
    // Ukupno dnevno opterećenje preko SVIH aktivnih faza u datom trenutku,
    // ne parno (P1-8.6): tri paralelne faze po 3h/dan = 9h/dan, a parovi bi
    // dali 6h i propustili upozorenje. Svaki skup preklopljenih faza je
    // aktivan na nekoj granici prozora, pa je dovoljno uzorkovati granice.
    const bounds = [...new Set(entries.flatMap(e => [e.start, e.due]))].sort()
    let worst = null
    for (const b of bounds) {
      const active = entries.filter(e => e.start <= b && b <= e.due)
      if (active.length < 2) continue
      const perDay = active.reduce((s, e) => s + e.perDay, 0)
      if (perDay > wdh + 1e-6 && (!worst || perDay > worst.perDay)) {
        worst = { person: name, phases: active.map(a => a.name), perDay, over: perDay - wdh }
      }
    }
    if (worst) warnings.push(worst)
  }
  warnings.sort((a, b) => b.over - a.over)

  return { stacks: STACKS, rows, warnings, workdayHours: wdh, workdaysPerWeek: wdpw, basis, anyWindow: rows.some(r => r.hasWindow) }
}
