// Sloj 3 — window-based capacity feasibility + overallocation.
// Each phase that has BOTH a start and due date defines a window. We compare
// the working-day capacity in that window (per stack) against the demand
// (effort), and detect people booked across overlapping phase windows.

import { buildStackMatrix, buildStackTeams, normalizeStack, STACKS } from './stacks.js'

const mondayIdx = d => (d.getDay() + 6) % 7
const isWorking = (d, wdpw) => mondayIdx(d) < wdpw

function countWorkingDays(startIso, dueIso, wdpw) {
  if (!startIso || !dueIso) return 0
  const s = new Date(startIso); s.setHours(0, 0, 0, 0)
  const e = new Date(dueIso); e.setHours(0, 0, 0, 0)
  if (e < s) return 0
  let n = 0, guard = 0
  const d = new Date(s)
  while (d <= e && guard++ < 4000) { if (isWorking(d, wdpw)) n++; d.setDate(d.getDate() + 1) }
  return n
}

const overlaps = (aS, aE, bS, bE) => !(new Date(aE) < new Date(bS) || new Date(bE) < new Date(aS))

const STATUS_RANK = { over: 5, nostaff: 4, tight: 3, nowindow: 2, ok: 1, none: 0 }
function worstStatus(cells) {
  let w = 'none'
  for (const s of STACKS) if (STATUS_RANK[cells[s].status] > STATUS_RANK[w]) w = cells[s].status
  return w
}

export function buildCapacity(tasks, phases, config, opts = {}) {
  const wdh = config?.workdayHours > 0 ? config.workdayHours : 6.5
  const wdpw = config?.workdaysPerWeek >= 1 && config?.workdaysPerWeek <= 7 ? config.workdaysPerWeek : 5
  const basis = opts.basis === 'plan' ? 'plan' : 'remaining'
  const demandOf = c => basis === 'plan' ? c.plan : Math.max(0, c.plan - c.spent)

  const matrix = buildStackMatrix(tasks || [], phases || [])
  const teams = buildStackTeams(tasks || [], phases || [])
  const phaseList = (phases || []).map(p => ({ id: String(p.id), name: p.name, start: p.start_date || null, due: p.due_date || null }))

  // ── Per-phase × stack feasibility ─────────────────────────────────────────
  const rows = phaseList.map(p => {
    const hasWindow = !!(p.start && p.due)
    const W = hasWindow ? countWorkingDays(p.start, p.due, wdpw) : 0
    const mRow = matrix.rows.find(r => r.phaseId === p.id)
    const cells = {}
    for (const s of STACKS) {
      const demand = mRow ? demandOf(mRow.cells[s]) : 0
      const people = teams.phaseStack[p.id]?.[s]?.realCount || 0
      const capacity = hasWindow ? W * people * wdh * 3600 : 0
      let status
      if (demand <= 0) status = 'none'
      else if (!hasWindow) status = 'nowindow'
      else if (people === 0) status = 'nostaff'
      else { const load = demand / capacity; status = load > 1 ? 'over' : load > 0.85 ? 'tight' : 'ok' }
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
  const addPP = (name, pid, est, spent) => {
    const dem = basis === 'plan' ? est : Math.max(0, est - spent)
    if (dem <= 0 || !name || name === 'Neraspoređeno') return
    if (!pp[name]) pp[name] = {}
    pp[name][pid] = (pp[name][pid] || 0) + dem
  }
  for (const task of (tasks || [])) {
    const pid = phaseOf[task.key] || 'none'
    const subs = task.subtasks || []
    const subEst = subs.reduce((a, x) => a + (x.timeoriginalestimate || 0), 0)
    const subSpent = subs.reduce((a, x) => a + (x.timespent || 0), 0)
    addPP(task.assignee, pid, Math.max(0, (task.est || 0) - subEst), Math.max(0, (task.spent || 0) - subSpent))
    for (const sub of subs) addPP(sub.assignee || task.assignee, pid, sub.timeoriginalestimate || 0, sub.timespent || 0)
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
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j]
        if (overlaps(a.start, a.due, b.start, b.due)) {
          const perDay = a.perDay + b.perDay
          if (perDay > wdh + 1e-6) {
            warnings.push({ person: name, phases: [a.name, b.name], perDay, over: perDay - wdh })
          }
        }
      }
    }
  }
  warnings.sort((a, b) => b.over - a.over)

  return { stacks: STACKS, rows, warnings, workdayHours: wdh, workdaysPerWeek: wdpw, basis, anyWindow: rows.some(r => r.hasWindow) }
}
