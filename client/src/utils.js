import { getCalcConfig } from './utils/calcConfig.js'

const DONE    = new Set(['Resolved', 'Closed', 'Done'])
const TESTING = new Set(['For Testing', 'TESTING STARTED', 'On Hold - Testing'])
const TODO    = new Set(['To Do', 'For Grooming', 'Estimated'])

const INPROG = new Set(['In Progress', 'For Testing', 'TESTING STARTED', 'On Hold - Testing', 'Development', 'Review', 'On Hold'])

export function getStatusCategory(statusName) {
  if (DONE.has(statusName)) return 'done'
  if (TESTING.has(statusName)) return 'testing'
  if (TODO.has(statusName)) return 'todo'
  if (INPROG.has(statusName)) return 'inprog'
  // Nov/nepoznat Jira status NE pada tiho u "u radu" (P1-8.3) — zasebna
  // kategorija koja se u UI prikazuje kao siva grupa.
  return 'unknown'
}

export function processEpicData(parents, subtasks, epicSelf = null) {
  // Deduplicate parents by key
  const seenKeys = new Set()
  const uniqueParents = parents.filter(p => {
    if (seenKeys.has(p.key)) return false
    seenKeys.add(p.key)
    return true
  })

  // Split into true top-level tasks vs subtask-level tasks.
  // Jira explicitly marks subtask issue types with issuetype.subtask === true.
  // This is reliable regardless of what the JQL returns (epics, stories, subtasks).
  const topLevel = []
  const childLevel = []
  for (const p of uniqueParents) {
    if (p.fields?.issuetype?.subtask === true) {
      childLevel.push(p)
    } else {
      topLevel.push(p)
    }
  }

  // Build subtask map from fetched subtasks + child-level tasks from JQL
  const subMap = {}
  function toSubEntry(issue) {
    const f = issue.fields || {}
    return {
      key: issue.key,
      summary: f.summary || '',
      status: f.status?.name || '',
      statusCategory: getStatusCategory(f.status?.name || ''),
      timespent: f.timespent || 0,
      timeoriginalestimate: f.timeoriginalestimate || 0,
      components: (f.components || []).map(c => c.name),
      assignee: f.assignee?.displayName || null,
      worklogs: f.worklogEntries || [],
    }
  }
  for (const sub of subtasks) subMap[sub.key] = toSubEntry(sub)
  for (const sub of childLevel) subMap[sub.key] = toSubEntry(sub)

  const tasks = []
  let totalEst = 0
  let totalSpent = 0
  let done = 0
  let inprog = 0
  let testing = 0
  let todo = 0
  let unknown = 0
  const unknownStatuses = new Set()
  const countCat = (cat, statusName) => {
    if (cat === 'done') done++
    else if (cat === 'testing') testing++
    else if (cat === 'todo') todo++
    else if (cat === 'unknown') { unknown++; if (statusName) unknownStatuses.add(statusName) }
    else inprog++
  }
  const overTasks = []

  for (const parent of topLevel) {
    const f = parent.fields || {}
    const statusName = f.status?.name || ''
    const statusCat = getStatusCategory(statusName)

    const parentEst = f.timeoriginalestimate || 0
    const parentSpent = f.timespent || 0

    let calcEst = parentEst
    let calcSpent = parentSpent
    const subs = []

    for (const subRef of (f.subtasks || [])) {
      const sub = subMap[subRef.key]
      if (!sub) continue

      calcEst += sub.timeoriginalestimate
      calcSpent += sub.timespent
      subs.push(sub)
    }

    const overFactor = 1 + getCalcConfig().overrunThresholdPct / 100
    const over = calcEst > 0 && calcSpent > calcEst * overFactor
    const overPct = calcEst > 0 ? Math.round(((calcSpent - calcEst) / calcEst) * 100) : 0

    const modules = f.modules || []

    const task = {
      key: parent.key,
      summary: f.summary || '',
      status: statusName,
      statusCategory: statusCat,
      est: calcEst,
      spent: calcSpent,
      over,
      overPct,
      subtasks: subs,
      assignee: f.assignee?.displayName || null,
      billable: f.billable === true,
      hoursToBill: f.hoursToBill > 0 ? f.hoursToBill * 3600 : 0, // Jira polje je u satima → sekunde
      modules,
      components: (f.components || []).map(c => c.name),
      worklogs: f.worklogEntries || [],
    }

    tasks.push(task)
    totalEst += calcEst
    totalSpent += calcSpent

    countCat(statusCat, statusName)

    if (over) overTasks.push(task)
  }

  // Orphan subtasks: subtask-type issues matched by the JQL whose parent is NOT
  // in the result. Their hours used to be silently dropped — count them as
  // standalone rows instead. Guard: only when the parent is absent, otherwise
  // the hours are already rolled up into the parent above (no double counting).
  const topLevelKeys = new Set(topLevel.map(p => p.key))
  for (const child of childLevel) {
    const f = child.fields || {}
    const parentKey = f.parent?.key || null
    if (parentKey && topLevelKeys.has(parentKey)) continue

    const statusName = f.status?.name || ''
    const statusCat = getStatusCategory(statusName)
    const est = f.timeoriginalestimate || 0
    const spent = f.timespent || 0
    const over = est > 0 && spent > est * (1 + getCalcConfig().overrunThresholdPct / 100)

    const task = {
      key: child.key,
      summary: f.summary || '',
      status: statusName,
      statusCategory: statusCat,
      est,
      spent,
      over,
      overPct: est > 0 ? Math.round(((spent - est) / est) * 100) : 0,
      subtasks: [],
      assignee: f.assignee?.displayName || null,
      billable: f.billable === true,
      hoursToBill: f.hoursToBill > 0 ? f.hoursToBill * 3600 : 0,
      modules: f.modules || [],
      components: (f.components || []).map(c => c.name),
      worklogs: f.worklogEntries || [],
      isOrphanSubtask: true,
      parentKey,
    }

    tasks.push(task)
    totalEst += est
    totalSpent += spent
    countCat(statusCat, statusName)
    if (over) overTasks.push(task)
  }

  // Hours logged directly on the epic issue itself — a visible standalone row
  // so the total matches Jira down to the last worklog.
  if (epicSelf && (epicSelf.timespent || 0) > 0) {
    const statusCat = getStatusCategory(epicSelf.status || '')
    tasks.push({
      key: epicSelf.key,
      summary: `${epicSelf.summary || epicSelf.key} — logovano direktno na epic`,
      status: epicSelf.status || '',
      statusCategory: statusCat,
      est: epicSelf.timeoriginalestimate || 0,
      spent: epicSelf.timespent || 0,
      over: false,
      overPct: 0,
      subtasks: [],
      assignee: epicSelf.assignee || null,
      billable: false,
      hoursToBill: 0,
      modules: [],
      components: [],
      worklogs: epicSelf.worklogEntries || [],
      isEpicSelf: true,
    })
    totalEst += epicSelf.timeoriginalestimate || 0
    totalSpent += epicSelf.timespent || 0
    countCat(statusCat, epicSelf.status || '')
  }

  const total = tasks.length

  return { tasks, totalEst, totalSpent, done, inprog, testing, todo, unknown, unknownStatuses: [...unknownStatuses], total, overTasks }
}

// {name → seconds} for one task: hours go to the worklog author; the assignee
// field is only the fallback for issues without worklog data. Sums exactly to
// task.spent (remainder from deleted authors/partial data goes to fallback).
export function taskAttribution(task) {
  const out = {}
  const add = (name, sec) => { if (sec > 0) { const k = name || 'Neraspoređeno'; out[k] = (out[k] || 0) + sec } }
  const attr = (spent, worklogs, fallback) => {
    if (!spent) return
    const logged = (worklogs || []).reduce((s, w) => s + (w.seconds || 0), 0)
    if (logged > 0) {
      for (const w of (worklogs || [])) add(w.author || fallback, w.seconds || 0)
      if (spent - logged > 0) add(fallback, spent - logged)
    } else add(fallback, spent)
  }
  const subs = task.subtasks || []
  const subTotal = subs.reduce((s, sub) => s + sub.timespent, 0)
  attr(Math.max(0, (task.spent || 0) - subTotal), task.worklogs, task.assignee)
  for (const sub of subs) attr(sub.timespent, sub.worklogs, sub.assignee || task.assignee)
  return out
}

// Hours are attributed to the person who ACTUALLY logged them (worklog author).
// Fallback to the assignee field only for issues whose worklogs are missing
// (e.g. cached data fetched before worklogs existed) — so nothing is lost.
export function buildAssigneeData(tasks) {
  const map = {}

  function entry(name) {
    const key = name || 'Neraspoređeno'
    if (!map[key]) map[key] = { name: key, totalSpent: 0, doneTasks: 0, inprogTasks: 0, todoTasks: 0, totalTasks: 0 }
    return map[key]
  }

  // Distribute one issue's spent seconds by its worklog authors; the remainder
  // (deleted authors, partial worklog data) goes to the fallback name.
  function attribute(spent, worklogs, fallbackName, perTask) {
    if (!spent) return
    const logged = (worklogs || []).reduce((s, w) => s + (w.seconds || 0), 0)
    if (logged > 0) {
      for (const w of worklogs) {
        if (!w.seconds) continue
        const name = w.author || fallbackName
        entry(name).totalSpent += w.seconds
        perTask.add(name || 'Neraspoređeno')
      }
      const remainder = spent - logged
      if (remainder > 0) {
        entry(fallbackName).totalSpent += remainder
        perTask.add(fallbackName || 'Neraspoređeno')
      }
    } else {
      entry(fallbackName).totalSpent += spent
      perTask.add(fallbackName || 'Neraspoređeno')
    }
  }

  for (const task of tasks) {
    const subs = task.subtasks || []

    // participants = everyone whose hours land on this task (for task counts)
    const participants = new Set()

    const subSpentTotal = subs.reduce((s, sub) => s + sub.timespent, 0)
    const parentOwnSpent = Math.max(0, task.spent - subSpentTotal)
    attribute(parentOwnSpent, task.worklogs, task.assignee, participants)
    for (const sub of subs) {
      attribute(sub.timespent, sub.worklogs, sub.assignee || task.assignee, participants)
    }

    // Tasks with no hours at all still belong to their assignee
    if (participants.size === 0) participants.add(task.assignee || 'Neraspoređeno')

    for (const name of participants) {
      const e = entry(name)
      e.totalTasks++
      if (task.statusCategory === 'done') e.doneTasks++
      else if (task.statusCategory === 'todo') e.todoTasks++
      else e.inprogTasks++
    }
  }

  return Object.values(map).sort((a, b) => b.totalSpent - a.totalSpent)
}

export function buildComponentData(tasks) {
  const map = {}

  function add(comp, spent, taskKey) {
    if (!map[comp]) map[comp] = { name: comp, totalSpent: 0, taskKeys: new Set() }
    map[comp].totalSpent += spent
    map[comp].taskKeys.add(taskKey)
  }

  for (const task of tasks) {
    const subs = task.subtasks || []

    // Time logged directly on the parent task (not via subtasks) → the parent's
    // own component(s); "Bez komponente" only when the task truly has none.
    const subSpentTotal = subs.reduce((s, sub) => s + sub.timespent, 0)
    const parentOwnSpent = Math.max(0, task.spent - subSpentTotal)
    if (parentOwnSpent > 0) {
      const parentComps = task.components && task.components.length > 0 ? task.components : ['Bez komponente']
      // 1/N po komponenti (kao moduli) — da zbir po komponentama = stvarno logovano
      for (const comp of parentComps) add(comp, parentOwnSpent / parentComps.length, task.key)
    }

    // Subtask time → their component, or "Bez komponente" if none set
    for (const sub of subs) {
      if (!sub.timespent) continue
      const comps = sub.components && sub.components.length > 0 ? sub.components : ['Bez komponente']
      for (const comp of comps) add(comp, sub.timespent / comps.length, task.key)
    }
  }

  const totalSpentAll = Object.values(map).reduce((s, d) => s + d.totalSpent, 0)
  return Object.values(map)
    .map(d => ({ name: d.name, totalSpent: d.totalSpent, taskCount: d.taskKeys.size, pct: totalSpentAll > 0 ? d.totalSpent / totalSpentAll : 0, totalSpentAll }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
}

// Per-module hours, with drill-down: who logged them (worklog authors, same
// attribution rules as buildAssigneeData) and on which tasks. A task tagged
// with N modules contributes 1/N of its hours to each.
export function buildModuleData(tasks) {
  const map = {}
  const noModuleTasks = []

  function mod(name) {
    if (!map[name]) map[name] = { name, totalSpent: 0, taskKeys: new Set(), people: {}, tasks: [] }
    return map[name]
  }

  for (const task of tasks) {
    const modules = task.modules || []
    const spent = task.spent || 0
    if (modules.length === 0) noModuleTasks.push({ key: task.key, summary: task.summary })
    if (spent <= 0 && modules.length === 0) continue

    const targets = modules.length > 0 ? modules : ['Bez modula']
    if (spent <= 0) {
      for (const name of targets) mod(name).taskKeys.add(task.key)
      continue
    }
    const share = 1 / targets.length
    const people = taskAttribution(task)
    for (const name of targets) {
      const m = mod(name)
      m.totalSpent += spent * share
      m.taskKeys.add(task.key)
      m.tasks.push({ key: task.key, summary: task.summary, status: task.status, spent: spent * share })
      for (const [p, sec] of Object.entries(people)) m.people[p] = (m.people[p] || 0) + sec * share
    }
  }

  const totalSpentAll = Object.values(map).reduce((s, d) => s + d.totalSpent, 0)
  return {
    moduleData: Object.values(map)
      .map(d => ({
        name: d.name,
        totalSpent: d.totalSpent,
        taskCount: d.taskKeys.size,
        pct: totalSpentAll > 0 ? d.totalSpent / totalSpentAll : 0,
        people: Object.entries(d.people).map(([name, spent]) => ({ name, spent })).sort((a, b) => b.spent - a.spent),
        tasks: d.tasks.sort((a, b) => b.spent - a.spent),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent),
    noModuleTasks,
  }
}

// Billable seconds for one task: "Hours to be billed" (when set) takes priority
// over logged time; non-billable tasks contribute 0.
export function billableSecondsOf(task) {
  if (!task?.billable) return 0
  return task.hoursToBill > 0 ? task.hoursToBill : (task.spent || 0)
}

export function fmtHours(seconds) {
  if (!seconds) return '0.0h'
  return (seconds / 3600).toFixed(1) + 'h'
}

// Demo data for users without Jira config
export const DEMO_PROJECTS = [
  {
    id: 'demo-1',
    epicKey: 'KNJAZ-184',
    displayName: 'Knjaz Miloš B2B Portal',
    demo: true,
    data: {
      tasks: generateDemoTasks('KNJAZ', 48, 20, 4, 24),
      totalEst: 221 * 3600,
      totalSpent: 189.6 * 3600,
      done: 20,
      testing: 4,
      inprog: 24,
      total: 48,
      overTasks: [],
    },
  },
  {
    id: 'demo-2',
    epicKey: 'CRM-169',
    displayName: 'IntelliSale CRM',
    demo: true,
    data: {
      tasks: generateDemoTasks('CRM', 35, 28, 5, 2),
      totalEst: 180 * 3600,
      totalSpent: 195 * 3600,
      done: 28,
      testing: 5,
      inprog: 2,
      total: 35,
      overTasks: [],
    },
  },
  {
    id: 'demo-3',
    epicKey: 'MOB-200',
    displayName: 'Mobile App 2.0',
    demo: true,
    data: {
      tasks: generateDemoTasks('MOB', 22, 8, 7, 7),
      totalEst: 140 * 3600,
      totalSpent: 88 * 3600,
      done: 8,
      testing: 7,
      inprog: 7,
      total: 22,
      overTasks: [],
    },
  },
]

function generateDemoTasks(prefix, total, doneCount, testingCount, inprogCount) {
  const tasks = []
  const statuses = [
    ...Array(doneCount).fill('Resolved'),
    ...Array(testingCount).fill('For Testing'),
    ...Array(inprogCount).fill('In Progress'),
  ]
  for (let i = 0; i < total; i++) {
    const statusName = statuses[i] || 'In Progress'
    const est = Math.floor(Math.random() * 14 + 2) * 3600
    const spent = Math.floor(est * (0.5 + Math.random() * 0.8))
    tasks.push({
      key: `${prefix}-${1000 + i}`,
      summary: `Demo task ${i + 1} — sample opis zadatka`,
      status: statusName,
      statusCategory: getStatusCategory(statusName),
      est,
      spent: statusName === 'For Grooming' ? 0 : spent,
      over: false,
      overPct: 0,
      subtasks: [],
    })
  }
  return tasks
}
