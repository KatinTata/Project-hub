// Golden-master testovi za client/src/utils/stacks.js.

import { describe, it, expect } from 'vitest'
import { STACKS, remainingOf, normalizeStack, buildStackMatrix, buildStackTeams } from '../client/src/utils/stacks.js'

const H = 3600

describe('normalizeStack', () => {
  it.each([
    ['Backend', 'Backend'], ['back-end', 'Backend'], ['BCK', 'Backend'], ['bckend', 'Backend'],
    ['Frontend', 'Frontend'], ['front', 'Frontend'], ['Web app', 'Frontend'],
    ['Mobile', 'Mobile'], ['app', 'Mobile'], ['Android', 'Mobile'], ['iOS', 'Mobile'],
    ['Database', 'Database'], ['DB', 'Database'], ['baza podataka', 'Database'], ['data-layer', 'Database'],
    ['Testing', 'Testing'], ['QA', 'Testing'], ['TESTING', 'Testing'],
    ['DevOps', 'Ostalo'], ['', 'Ostalo'], [null, 'Ostalo'], ['nešto čudno', 'Ostalo'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeStack(input)).toBe(expected)
  })
})

describe('remainingOf', () => {
  it('done → 0 bez obzira na sate', () => {
    expect(remainingOf('done', 10 * H, 2 * H)).toBe(0)
  })
  it('todo → pun plan', () => {
    expect(remainingOf('todo', 10 * H, 3 * H)).toBe(10 * H)
  })
  it('inprog → plan − spent', () => {
    expect(remainingOf('inprog', 10 * H, 3 * H)).toBe(7 * H)
  })
  // [ISPRAVKA P1-8.4] otvoren task preko plana zadržava rep od 10% estimacije
  it('inprog preko plana → 10% plana kao minimalni preostali rad', () => {
    expect(remainingOf('inprog', 10 * H, 15 * H)).toBe(1 * H)
    expect(remainingOf('testing', 5 * H, 5 * H)).toBe(0.5 * H)
  })

  it('rep se ne primenjuje kad plana nema', () => {
    expect(remainingOf('inprog', 0, 5 * H)).toBe(0)
  })
})

function task(key, { est = 0, spent = 0, statusCategory = 'inprog', components = [], assignee = null, subtasks = [] } = {}) {
  return { key, est, spent, statusCategory, components, assignee, subtasks }
}

describe('buildStackMatrix', () => {
  it('parent-own ide na components[0], subtaskovi na svoje komponente', () => {
    const tasks = [task('A-1', {
      est: 10 * H, spent: 4 * H, statusCategory: 'inprog', components: ['Backend', 'Frontend'],
      subtasks: [{ timeoriginalestimate: 6 * H, timespent: 2 * H, components: ['Frontend'], statusCategory: 'inprog' }],
    })]
    const m = buildStackMatrix(tasks, [])
    const row = m.rows[0] // 'none' (bez faza)
    expect(row.phaseId).toBe('none')
    // parent-own: est 10−6=4, spent 4−2=2 → Backend (components[0])
    expect(row.cells.Backend.plan).toBe(4 * H)
    expect(row.cells.Backend.spent).toBe(2 * H)
    // subtask → Frontend
    expect(row.cells.Frontend.plan).toBe(6 * H)
    expect(row.cells.Frontend.spent).toBe(2 * H)
    expect(m.grand.plan).toBe(10 * H)
    expect(m.grand.spent).toBe(4 * H)
  })

  it('taskovi se mapiraju u faze po taskKeys', () => {
    const tasks = [
      task('A-1', { est: 4 * H, statusCategory: 'todo', components: ['Backend'] }),
      task('A-2', { est: 2 * H, statusCategory: 'todo', components: ['Backend'] }),
    ]
    const phases = [{ id: 7, name: 'Faza 1', taskKeys: ['A-1'] }]
    const m = buildStackMatrix(tasks, phases)
    const f1 = m.rows.find(r => r.phaseId === '7')
    const none = m.rows.find(r => r.phaseId === 'none')
    expect(f1.cells.Backend.plan).toBe(4 * H)
    expect(none.cells.Backend.plan).toBe(2 * H)
  })

  it('nepoznata komponenta ide u Ostalo sa raw imenom', () => {
    const m = buildStackMatrix([task('A-1', { est: 3 * H, components: ['DevOps'] })], [])
    expect(m.rows[0].cells.Ostalo.plan).toBe(3 * H)
    expect(m.ostalo).toEqual([{ name: 'DevOps', plan: 3 * H, spent: 0 }])
  })

  it('remaining po ćeliji je status-aware', () => {
    const tasks = [
      task('A-1', { est: 10 * H, spent: 4 * H, statusCategory: 'inprog', components: ['Backend'] }),
      task('A-2', { est: 8 * H, spent: 8 * H, statusCategory: 'done', components: ['Backend'] }),
      task('A-3', { est: 6 * H, spent: 0, statusCategory: 'todo', components: ['Backend'] }),
    ]
    const m = buildStackMatrix(tasks, [])
    expect(m.rows[0].cells.Backend.remaining).toBe(6 * H + 6 * H) // inprog 6h + todo 6h + done 0
  })

  it('prazan red faze bez sati se ne pojavljuje za none', () => {
    const m = buildStackMatrix([], [])
    expect(m.rows).toHaveLength(0)
    expect(m.grand.plan).toBe(0)
  })
})

describe('buildStackTeams', () => {
  it('realCount ne broji Neraspoređeno', () => {
    const tasks = [
      task('A-1', { est: 4 * H, components: ['Backend'], assignee: 'Ana' }),
      task('A-2', { est: 2 * H, components: ['Backend'], assignee: null }),
    ]
    const t = buildStackTeams(tasks, [])
    expect(t.byStack.Backend.people).toContain('Ana')
    expect(t.byStack.Backend.people).toContain('Neraspoređeno')
    expect(t.byStack.Backend.realCount).toBe(1)
  })

  it('osoba se pojavljuje u svim stekovima gde ima sati', () => {
    const tasks = [
      task('A-1', { est: 4 * H, components: ['Backend'], assignee: 'Ana' }),
      task('A-2', { est: 2 * H, components: ['Frontend'], assignee: 'Ana' }),
    ]
    const t = buildStackTeams(tasks, [])
    const ana = t.people.find(p => p.name === 'Ana')
    expect(ana.stacks.sort()).toEqual(['Backend', 'Frontend'])
    expect(ana.est).toBe(6 * H)
  })
})

describe('STACKS konstanta', () => {
  it('sadrži svih 6 stekova u očekivanom redosledu', () => {
    expect(STACKS).toEqual(['Backend', 'Frontend', 'Mobile', 'Database', 'Testing', 'Ostalo'])
  })
})
