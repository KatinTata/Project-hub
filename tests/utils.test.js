// Golden-master testovi za client/src/utils.js — snimaju TRENUTNO ponašanje.
// Slučajevi označeni sa [BUG P1-8.x] namerno dokumentuju postojeću grešku;
// stavka 8 će ih svesno promeniti (crveno → zeleno sa novom očekivanom vrednošću).

import { describe, it, expect } from 'vitest'
import {
  getStatusCategory, processEpicData, taskAttribution, buildAssigneeData,
  buildComponentData, buildModuleData, billableSecondsOf, fmtHours,
} from '../client/src/utils.js'

const H = 3600

function parent(key, { status = 'In Progress', est = 0, spent = 0, subtaskKeys = [], components = [], assignee = null, billable, hoursToBill, modules, worklogs, subtask = false, parentKey = null } = {}) {
  return {
    key,
    fields: {
      summary: `Task ${key}`,
      status: { name: status },
      issuetype: { subtask },
      timeoriginalestimate: est,
      timespent: spent,
      subtasks: subtaskKeys.map(k => ({ key: k })),
      components: components.map(name => ({ name })),
      assignee: assignee ? { displayName: assignee } : null,
      ...(billable !== undefined ? { billable } : {}),
      ...(hoursToBill !== undefined ? { hoursToBill } : {}),
      ...(modules !== undefined ? { modules } : {}),
      ...(worklogs !== undefined ? { worklogEntries: worklogs } : {}),
      ...(parentKey ? { parent: { key: parentKey } } : {}),
    },
  }
}

function sub(key, { status = 'In Progress', est = 0, spent = 0, components = [], assignee = null, worklogs } = {}) {
  return parent(key, { status, est, spent, components, assignee, worklogs, subtask: true })
}

describe('getStatusCategory', () => {
  it.each([
    ['Resolved', 'done'], ['Closed', 'done'], ['Done', 'done'],
    ['For Testing', 'testing'], ['TESTING STARTED', 'testing'], ['On Hold - Testing', 'testing'],
    ['To Do', 'todo'], ['For Grooming', 'todo'], ['Estimated', 'todo'],
    ['In Progress', 'inprog'], ['Development', 'inprog'], ['Review', 'inprog'],
  ])('%s → %s', (status, cat) => {
    expect(getStatusCategory(status)).toBe(cat)
  })

  // [BUG P1-8.3] nepoznat status tiho pada u 'inprog'
  it('nepoznat status pada u inprog (golden master)', () => {
    expect(getStatusCategory('Blocked By Vendor')).toBe('inprog')
    expect(getStatusCategory('')).toBe('inprog')
  })
})

describe('processEpicData — osnovni agregati', () => {
  it('sabira est/spent roditelja i subtaskova', () => {
    const p = parent('A-1', { est: 4 * H, spent: 2 * H, subtaskKeys: ['A-2', 'A-3'] })
    const subs = [
      sub('A-2', { est: 3 * H, spent: 1 * H }),
      sub('A-3', { est: 1 * H, spent: 5 * H }),
    ]
    const r = processEpicData([p], subs)
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].est).toBe(8 * H)
    expect(r.tasks[0].spent).toBe(8 * H)
    expect(r.totalEst).toBe(8 * H)
    expect(r.totalSpent).toBe(8 * H)
  })

  it('ignoriše subtask referencu koja nije u subMap', () => {
    const p = parent('A-1', { est: 4 * H, spent: 0, subtaskKeys: ['A-404'] })
    const r = processEpicData([p], [])
    expect(r.tasks[0].est).toBe(4 * H)
    expect(r.tasks[0].subtasks).toHaveLength(0)
  })

  it('deduplikuje roditelje po ključu', () => {
    const p = parent('A-1', { est: 1 * H })
    const r = processEpicData([p, parent('A-1', { est: 99 * H })], [])
    expect(r.tasks).toHaveLength(1)
    expect(r.totalEst).toBe(1 * H)
  })

  it('broji statusne kategorije', () => {
    const r = processEpicData([
      parent('A-1', { status: 'Resolved' }),
      parent('A-2', { status: 'For Testing' }),
      parent('A-3', { status: 'To Do' }),
      parent('A-4', { status: 'In Progress' }),
      parent('A-5', { status: 'Nepoznat Status' }), // [BUG P1-8.3] broji se kao inprog
    ], [])
    expect(r.done).toBe(1)
    expect(r.testing).toBe(1)
    expect(r.todo).toBe(1)
    expect(r.inprog).toBe(2)
    expect(r.total).toBe(5)
  })
})

describe('processEpicData — prag prekoračenja 15%', () => {
  it('spent = est × 1.14 nije over', () => {
    const r = processEpicData([parent('A-1', { est: 100 * H, spent: 114 * H })], [])
    expect(r.tasks[0].over).toBe(false)
    expect(r.overTasks).toHaveLength(0)
  })

  it('spent = est × 1.16 jeste over', () => {
    const r = processEpicData([parent('A-1', { est: 100 * H, spent: 116 * H })], [])
    expect(r.tasks[0].over).toBe(true)
    expect(r.tasks[0].overPct).toBe(16)
    expect(r.overTasks).toHaveLength(1)
  })

  it('est = 0 nikad nije over', () => {
    const r = processEpicData([parent('A-1', { est: 0, spent: 50 * H })], [])
    expect(r.tasks[0].over).toBe(false)
    expect(r.tasks[0].overPct).toBe(0)
  })
})

describe('processEpicData — orphan subtaskovi', () => {
  it('subtask bez roditelja u rezultatu postaje zaseban red', () => {
    const orphan = parent('A-9', { est: 2 * H, spent: 1 * H, subtask: true, parentKey: 'A-100' })
    const r = processEpicData([orphan], [])
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].isOrphanSubtask).toBe(true)
    expect(r.totalEst).toBe(2 * H)
  })

  it('subtask čiji roditelj JESTE u rezultatu se ne duplira', () => {
    const p = parent('A-1', { est: 4 * H, subtaskKeys: ['A-2'] })
    const childInJql = parent('A-2', { est: 3 * H, spent: 1 * H, subtask: true, parentKey: 'A-1' })
    const r = processEpicData([p, childInJql], [])
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].est).toBe(7 * H) // roditelj + subtask, bez dupliranja
    expect(r.totalEst).toBe(7 * H)
  })
})

describe('processEpicData — epicSelf', () => {
  it('sati logovani na epiku postaju zaseban red', () => {
    const r = processEpicData([parent('A-1', { est: 1 * H })], [], {
      key: 'EPIC-1', summary: 'Moj epic', status: 'In Progress', timespent: 3 * H, timeoriginalestimate: 0,
    })
    expect(r.tasks).toHaveLength(2)
    const epicRow = r.tasks.find(t => t.isEpicSelf)
    expect(epicRow.spent).toBe(3 * H)
    expect(r.totalSpent).toBe(3 * H)
  })

  it('epicSelf bez sati se ignoriše', () => {
    const r = processEpicData([parent('A-1', {})], [], { key: 'EPIC-1', timespent: 0 })
    expect(r.tasks).toHaveLength(1)
  })
})

describe('processEpicData — billable i hoursToBill', () => {
  it('hoursToBill se konvertuje iz sati u sekunde', () => {
    const r = processEpicData([parent('A-1', { billable: true, hoursToBill: 5 })], [])
    expect(r.tasks[0].hoursToBill).toBe(5 * H)
    expect(r.tasks[0].billable).toBe(true)
  })

  it('billable je false kad polje nije true', () => {
    const r = processEpicData([parent('A-1', {})], [])
    expect(r.tasks[0].billable).toBe(false)
  })
})

describe('billableSecondsOf', () => {
  it('ne-billable → 0', () => {
    expect(billableSecondsOf({ billable: false, spent: 10 * H })).toBe(0)
  })
  it('hoursToBill ima prioritet nad spent', () => {
    expect(billableSecondsOf({ billable: true, hoursToBill: 4 * H, spent: 10 * H })).toBe(4 * H)
  })
  it('bez hoursToBill koristi spent', () => {
    expect(billableSecondsOf({ billable: true, hoursToBill: 0, spent: 10 * H })).toBe(10 * H)
  })
})

describe('taskAttribution', () => {
  it('sati idu autoru workloga, ostatak fallback-u', () => {
    const task = {
      spent: 10 * H, assignee: 'Ana',
      worklogs: [{ author: 'Marko', seconds: 6 * H }],
      subtasks: [],
    }
    const out = taskAttribution(task)
    expect(out['Marko']).toBe(6 * H)
    expect(out['Ana']).toBe(4 * H) // remainder
  })

  it('bez workloga sve ide assignee-ju; bez assignee-ja u Neraspoređeno', () => {
    expect(taskAttribution({ spent: 5 * H, assignee: 'Ana', subtasks: [] })).toEqual({ Ana: 5 * H })
    expect(taskAttribution({ spent: 5 * H, assignee: null, subtasks: [] })).toEqual({ 'Neraspoređeno': 5 * H })
  })

  it('subtask sati idu autoru subtask workloga', () => {
    const task = {
      spent: 8 * H, assignee: 'Ana', worklogs: [],
      subtasks: [{ timespent: 8 * H, assignee: 'Jovan', worklogs: [{ author: 'Jovan', seconds: 8 * H }] }],
    }
    expect(taskAttribution(task)).toEqual({ Jovan: 8 * H })
  })
})

describe('buildAssigneeData', () => {
  it('agregira sate po osobi i broji taskove po statusu', () => {
    const tasks = [
      { key: 'A-1', statusCategory: 'done', spent: 4 * H, assignee: 'Ana', worklogs: [], subtasks: [] },
      { key: 'A-2', statusCategory: 'inprog', spent: 2 * H, assignee: 'Ana', worklogs: [], subtasks: [] },
      { key: 'A-3', statusCategory: 'todo', spent: 0, assignee: 'Marko', worklogs: [], subtasks: [] },
    ]
    const rows = buildAssigneeData(tasks)
    const ana = rows.find(r => r.name === 'Ana')
    expect(ana.totalSpent).toBe(6 * H)
    expect(ana.doneTasks).toBe(1)
    expect(ana.inprogTasks).toBe(1)
    expect(ana.totalTasks).toBe(2)
    const marko = rows.find(r => r.name === 'Marko')
    expect(marko.todoTasks).toBe(1)
    expect(marko.totalSpent).toBe(0)
  })
})

describe('buildComponentData', () => {
  it('parent-own sati idu na komponentu roditelja, subtask sati na svoju', () => {
    const tasks = [{
      key: 'A-1', spent: 10 * H, components: ['Backend'],
      subtasks: [{ timespent: 4 * H, components: ['Frontend'] }],
    }]
    const rows = buildComponentData(tasks)
    expect(rows.find(r => r.name === 'Backend').totalSpent).toBe(6 * H)
    expect(rows.find(r => r.name === 'Frontend').totalSpent).toBe(4 * H)
  })

  // [BUG P1-8.1] task sa više komponenti dodaje PUN iznos u svaku → imenilac naduvan
  it('više komponenti: pun iznos u svaku, totalSpentAll naduvan (golden master)', () => {
    const tasks = [{ key: 'A-1', spent: 10 * H, components: ['Backend', 'Frontend'], subtasks: [] }]
    const rows = buildComponentData(tasks)
    expect(rows.find(r => r.name === 'Backend').totalSpent).toBe(10 * H)
    expect(rows.find(r => r.name === 'Frontend').totalSpent).toBe(10 * H)
    expect(rows[0].totalSpentAll).toBe(20 * H) // stvarno logovano: 10h
  })

  it('bez komponente → "Bez komponente"', () => {
    const rows = buildComponentData([{ key: 'A-1', spent: 3 * H, components: [], subtasks: [] }])
    expect(rows[0].name).toBe('Bez komponente')
  })
})

describe('buildModuleData', () => {
  it('task sa N modula daje 1/N sati svakom', () => {
    const { moduleData } = buildModuleData([
      { key: 'A-1', summary: '', status: 'In Progress', spent: 10 * H, modules: ['M1', 'M2'], subtasks: [], worklogs: [], assignee: 'Ana' },
    ])
    expect(moduleData.find(m => m.name === 'M1').totalSpent).toBe(5 * H)
    expect(moduleData.find(m => m.name === 'M2').totalSpent).toBe(5 * H)
  })

  it('task bez modula ide u noModuleTasks i "Bez modula"', () => {
    const { moduleData, noModuleTasks } = buildModuleData([
      { key: 'A-1', summary: 'x', status: '', spent: 4 * H, modules: [], subtasks: [], worklogs: [], assignee: null },
    ])
    expect(noModuleTasks).toHaveLength(1)
    expect(moduleData.find(m => m.name === 'Bez modula').totalSpent).toBe(4 * H)
  })
})

describe('fmtHours', () => {
  it('formatira sekunde u sate', () => {
    expect(fmtHours(0)).toBe('0.0h')
    expect(fmtHours(3600)).toBe('1.0h')
    expect(fmtHours(5400)).toBe('1.5h')
  })
})
