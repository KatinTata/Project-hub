// Stack (discipline) model for resource planning — Sloj 0.
// Stack = Jira component, normalized to a canonical set. Attribution is per
// subtask (its component); a task's own time (no/extra subtasks) goes to the
// main task's component. Missing/unrecognized → "Ostalo".
//
// The matrix reconciles exactly to processEpicData totals: for every task,
// (parent-own est/spent) + Σ(included subtask est/spent) === task.est / task.spent.

export const STACKS = ['Backend', 'Frontend', 'Testing', 'Ostalo']

// Alias config — messy Jira component names → canonical stack.
// Kept as data so it can be made editable later without code changes.
export function normalizeStack(name) {
  const clean = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!clean) return 'Ostalo'
  if (clean.startsWith('back') || clean === 'bck' || clean === 'bckend') return 'Backend'
  if (clean.startsWith('front')) return 'Frontend'
  if (clean.startsWith('test') || clean === 'qa') return 'Testing'
  return 'Ostalo'
}

export function buildStackMatrix(tasks, phases) {
  const phaseList = (phases || []).map(p => ({ id: String(p.id), name: p.name }))
  const phaseOf = {}
  for (const p of (phases || [])) for (const k of (p.taskKeys || [])) phaseOf[k] = String(p.id)

  const blankCells = () => {
    const o = {}
    for (const s of STACKS) o[s] = { plan: 0, spent: 0 }
    return o
  }

  const rowsMap = {}
  for (const p of phaseList) rowsMap[p.id] = { phaseId: p.id, phaseName: p.name, cells: blankCells(), total: { plan: 0, spent: 0 } }
  rowsMap.none = { phaseId: 'none', phaseName: 'Neraspoređeno', cells: blankCells(), total: { plan: 0, spent: 0 } }

  const ostalo = {} // raw component name → { name, plan, spent }
  const addOstaloRaw = (raw, plan, spent) => {
    const key = raw && String(raw).trim() ? String(raw).trim() : '(bez komponente)'
    if (!ostalo[key]) ostalo[key] = { name: key, plan: 0, spent: 0 }
    ostalo[key].plan += plan
    ostalo[key].spent += spent
  }

  const attribute = (pid, rawComp, plan, spent) => {
    if (plan === 0 && spent === 0) return
    const stack = normalizeStack(rawComp)
    const row = rowsMap[pid] || rowsMap.none
    row.cells[stack].plan += plan
    row.cells[stack].spent += spent
    row.total.plan += plan
    row.total.spent += spent
    if (stack === 'Ostalo') addOstaloRaw(rawComp, plan, spent)
  }

  for (const task of (tasks || [])) {
    const pid = phaseOf[task.key] || 'none'
    const subs = task.subtasks || []
    const subEst = subs.reduce((s, x) => s + (x.timeoriginalestimate || 0), 0)
    const subSpent = subs.reduce((s, x) => s + (x.timespent || 0), 0)

    // Parent-own remainder → main task component (equals raw parent est/spent)
    const parentEst = Math.max(0, (task.est || 0) - subEst)
    const parentSpent = Math.max(0, (task.spent || 0) - subSpent)
    const mainComp = (task.components || [])[0] || ''
    attribute(pid, mainComp, parentEst, parentSpent)

    // Each included subtask → its own component
    for (const sub of subs) {
      const comp = (sub.components || [])[0] || ''
      attribute(pid, comp, sub.timeoriginalestimate || 0, sub.timespent || 0)
    }
  }

  const rows = phaseList.map(p => rowsMap[p.id])
  if (rowsMap.none.total.plan > 0 || rowsMap.none.total.spent > 0) rows.push(rowsMap.none)

  const colTotals = {}
  for (const s of STACKS) colTotals[s] = { plan: 0, spent: 0 }
  const grand = { plan: 0, spent: 0 }
  for (const r of rows) {
    for (const s of STACKS) {
      colTotals[s].plan += r.cells[s].plan
      colTotals[s].spent += r.cells[s].spent
    }
    grand.plan += r.total.plan
    grand.spent += r.total.spent
  }

  const ostaloList = Object.values(ostalo).sort((a, b) => b.spent - a.spent || b.plan - a.plan)

  return { stacks: STACKS, rows, colTotals, grand, ostalo: ostaloList }
}
