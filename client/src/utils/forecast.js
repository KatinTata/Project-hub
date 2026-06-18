// Capacity forecast — Sloj 1.
// Converts per-phase/per-stack EFFORT (from the stack matrix) into a calendar
// projection: man-days → duration (÷ people) → chained finish dates, using the
// working-calendar config (hours/day, working days/week).
//
// Effort is independent of how many people work; duration is not. Phases are
// chained by their given order (Faza 2 starts when Faza 1 finishes). Stacks
// within a phase run in parallel → phase duration = the longest stack.

// Monday-based weekday index: Mon=0 … Sun=6
function mondayIdx(d) { return (d.getDay() + 6) % 7 }
function isWorking(d, wdpw) { return mondayIdx(d) < wdpw }

function snapForward(date, wdpw) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  let guard = 0
  while (!isWorking(d, wdpw) && guard++ < 14) d.setDate(d.getDate() + 1)
  return d
}

// k working days after `base` (k=0 → base itself, snapped to a working day)
function advanceWorkingDays(base, k, wdpw) {
  let d = snapForward(base, wdpw)
  let count = 0
  while (count < k) {
    d.setDate(d.getDate() + 1)
    if (isWorking(d, wdpw)) count++
  }
  return d
}

function isoLocal(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function buildPhaseForecast(matrix, config, opts = {}) {
  const workdayHours = config?.workdayHours > 0 ? config.workdayHours : 6.5
  const wdpw = config?.workdaysPerWeek >= 1 && config?.workdaysPerWeek <= 7 ? config.workdaysPerWeek : 5
  const basis = opts.basis === 'plan' ? 'plan' : 'remaining'
  const fallbackPeople = opts.peoplePerStack > 0 ? opts.peoplePerStack : 1
  const peopleMap = opts.peoplePerStackMap || null
  const peopleFor = s => {
    const n = peopleMap ? peopleMap[s] : null
    return n > 0 ? n : fallbackPeople
  }
  const today = opts.today ? new Date(opts.today) : new Date()

  const stacks = matrix?.stacks || []
  // Real phases only (skip the synthetic "Neraspoređeno" row), in given order.
  const rows = (matrix?.rows || []).filter(r => r.phaseId !== 'none')

  const projectStart = snapForward(today, wdpw)
  let cursor = 0 // working-day offset from projectStart
  const phases = []
  let grandManDays = 0

  for (const row of rows) {
    const stackManDays = {}
    let phaseDurationDays = 0
    let phaseManDays = 0
    for (const s of stacks) {
      const cell = row.cells[s] || { plan: 0, spent: 0, remaining: 0 }
      // 'remaining' is status-aware (done→0, todo→plan, inprog→plan−spent),
      // computed in buildStackMatrix; 'plan' uses the full estimate.
      const effortSec = basis === 'plan' ? cell.plan : (cell.remaining || 0)
      const manDays = (effortSec / 3600) / workdayHours
      stackManDays[s] = manDays
      phaseManDays += manDays
      const stackDuration = manDays / peopleFor(s)
      if (stackDuration > phaseDurationDays) phaseDurationDays = stackDuration
    }
    const durationWorkingDays = Math.ceil(phaseDurationDays - 1e-9)
    const start = advanceWorkingDays(projectStart, cursor, wdpw)
    const end = durationWorkingDays > 0
      ? advanceWorkingDays(projectStart, cursor + durationWorkingDays - 1, wdpw)
      : start
    if (durationWorkingDays > 0) cursor += durationWorkingDays

    grandManDays += phaseManDays
    phases.push({
      phaseId: row.phaseId,
      phaseName: row.phaseName,
      stackManDays,
      totalManDays: phaseManDays,
      durationDays: phaseDurationDays,
      durationWorkingDays,
      start: isoLocal(start),
      end: isoLocal(end),
      empty: phaseManDays <= 0,
    })
  }

  const worked = phases.filter(p => p.durationWorkingDays > 0)
  const projectEnd = worked.length ? worked[worked.length - 1].end : isoLocal(projectStart)

  return {
    workdayHours,
    workdaysPerWeek: wdpw,
    basis,
    peoplePerStack: peopleMap || fallbackPeople,
    projectStart: isoLocal(projectStart),
    projectEnd,
    totalWorkingDays: cursor,
    grandManDays,
    phases,
  }
}
