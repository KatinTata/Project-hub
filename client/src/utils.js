const DONE    = new Set(['Resolved', 'Closed', 'Done'])
const TESTING = new Set(['For Testing', 'TESTING STARTED', 'On Hold - Testing'])
const TODO    = new Set(['To Do', 'For Grooming', 'Estimated'])

export function getStatusCategory(statusName) {
  if (DONE.has(statusName)) return 'done'
  if (TESTING.has(statusName)) return 'testing'
  if (TODO.has(statusName)) return 'todo'
  return 'inprog'
}

export function processEpicData(parents, subtasks) {
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

    const over = calcEst > 0 && calcSpent > calcEst * 1.15
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
      modules,
      components: (f.components || []).map(c => c.name),
    }

    tasks.push(task)
    totalEst += calcEst
    totalSpent += calcSpent

    if (statusCat === 'done') done++
    else if (statusCat === 'testing') testing++
    else if (statusCat === 'todo') todo++
    else inprog++

    if (over) overTasks.push(task)
  }

  const total = tasks.length

  return { tasks, totalEst, totalSpent, done, inprog, testing, todo, total, overTasks }
}

export function buildAssigneeData(tasks) {
  const map = {}

  function entry(name) {
    const key = name || 'Neraspoređeno'
    if (!map[key]) map[key] = { name: key, totalSpent: 0, doneTasks: 0, inprogTasks: 0, todoTasks: 0, totalTasks: 0 }
    return map[key]
  }

  for (const task of tasks) {
    const subs = task.subtasks || []

    // Task count: parent assignee always gets it
    const pe = entry(task.assignee)
    pe.totalTasks++
    if (task.statusCategory === 'done') pe.doneTasks++
    else if (task.statusCategory === 'todo') pe.todoTasks++
    else pe.inprogTasks++

    // Task count: subtask assignees who differ from parent also get credited
    // (deduplicated — one person counts once per parent task)
    const subAssignees = new Set()
    for (const sub of subs) {
      const a = sub.assignee || task.assignee
      if (a && a !== (task.assignee || null)) subAssignees.add(a)
    }
    for (const a of subAssignees) {
      const se = entry(a)
      se.totalTasks++
      if (task.statusCategory === 'done') se.doneTasks++
      else if (task.statusCategory === 'todo') se.todoTasks++
      else se.inprogTasks++
    }

    // Spent: attribute each subtask's hours to the subtask's own assignee
    if (subs.length === 0) {
      pe.totalSpent += task.spent
    } else {
      const subSpentTotal = subs.reduce((s, sub) => s + sub.timespent, 0)
      const parentOwnSpent = Math.max(0, task.spent - subSpentTotal)
      if (parentOwnSpent > 0) pe.totalSpent += parentOwnSpent
      for (const sub of subs) {
        if (sub.timespent > 0) {
          entry(sub.assignee || task.assignee).totalSpent += sub.timespent
        }
      }
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
      for (const comp of parentComps) add(comp, parentOwnSpent, task.key)
    }

    // Subtask time → their component, or "Bez komponente" if none set
    for (const sub of subs) {
      if (!sub.timespent) continue
      const comps = sub.components && sub.components.length > 0 ? sub.components : ['Bez komponente']
      for (const comp of comps) add(comp, sub.timespent, task.key)
    }
  }

  const totalSpentAll = Object.values(map).reduce((s, d) => s + d.totalSpent, 0)
  return Object.values(map)
    .map(d => ({ name: d.name, totalSpent: d.totalSpent, taskCount: d.taskKeys.size, pct: totalSpentAll > 0 ? d.totalSpent / totalSpentAll : 0, totalSpentAll }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
}

export function buildModuleData(tasks) {
  const map = {}
  const noModuleTasks = []

  function add(name, spentShare, taskKey) {
    if (!map[name]) map[name] = { name, totalSpent: 0, taskKeys: new Set() }
    map[name].totalSpent += spentShare
    map[name].taskKeys.add(taskKey)
  }

  for (const task of tasks) {
    const modules = task.modules || []
    const spent = task.spent || 0
    if (modules.length === 0) {
      noModuleTasks.push({ key: task.key, summary: task.summary })
      if (spent > 0) add('Bez modula', spent, task.key)
    } else {
      const share = spent / modules.length
      for (const mod of modules) add(mod, share, task.key)
    }
  }

  const totalSpentAll = Object.values(map).reduce((s, d) => s + d.totalSpent, 0)
  return {
    moduleData: Object.values(map)
      .map(d => ({ name: d.name, totalSpent: d.totalSpent, taskCount: d.taskKeys.size, pct: totalSpentAll > 0 ? d.totalSpent / totalSpentAll : 0 }))
      .sort((a, b) => b.totalSpent - a.totalSpent),
    noModuleTasks,
  }
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
