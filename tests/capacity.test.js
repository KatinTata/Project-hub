// Golden-master testovi za client/src/utils/capacity.js.
// Prozori su fiksni datumi u avgustu 2026 (2026-08-10 je ponedeljak).

import { describe, it, expect } from 'vitest'
import { buildCapacity } from '../client/src/utils/capacity.js'

const H = 3600

function task(key, { est = 0, spent = 0, statusCategory = 'todo', components = ['Backend'], assignee = 'Ana', subtasks = [] } = {}) {
  return { key, est, spent, statusCategory, components, assignee, subtasks }
}

function phase(id, name, start, due, taskKeys) {
  return { id, name, start_date: start, due_date: due, taskKeys }
}

describe('buildCapacity — prozor i load', () => {
  it('radni dani u prozoru pon-pet = 5', () => {
    const phases = [phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1'])]
    const c = buildCapacity([task('A-1', { est: 13 * H })], phases, {}, { peoplePerStack: { Backend: 1 } })
    expect(c.rows[0].workingDays).toBe(5)
    expect(c.rows[0].hasWindow).toBe(true)
  })

  it('load ispod 0.85 → ok', () => {
    const phases = [phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1'])]
    const c = buildCapacity([task('A-1', { est: 13 * H })], phases, {}, { peoplePerStack: { Backend: 1 } })
    const cell = c.rows[0].cells.Backend
    expect(cell.capacity).toBe(5 * 6.5 * H)
    expect(cell.load).toBeCloseTo(0.4)
    expect(cell.status).toBe('ok')
  })

  it('load 0.85–1.0 → tight', () => {
    const phases = [phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1'])]
    const c = buildCapacity([task('A-1', { est: 30 * H })], phases, {}, { peoplePerStack: { Backend: 1 } })
    expect(c.rows[0].cells.Backend.status).toBe('tight')
  })

  it('load preko 1.0 → over', () => {
    const phases = [phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1'])]
    const c = buildCapacity([task('A-1', { est: 39 * H })], phases, {}, { peoplePerStack: { Backend: 1 } })
    expect(c.rows[0].cells.Backend.status).toBe('over')
    expect(c.rows[0].worst).toBe('over')
  })

  it('demand > 0 bez ljudi → nostaff', () => {
    const phases = [phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1'])]
    const c = buildCapacity([task('A-1', { est: 13 * H, assignee: null })], phases, {}, { peoplePerStack: { Backend: 0 } })
    expect(c.rows[0].cells.Backend.status).toBe('nostaff')
  })

  it('demand > 0 bez prozora → nowindow', () => {
    const phases = [phase(1, 'F1', null, null, ['A-1'])]
    const c = buildCapacity([task('A-1', { est: 13 * H })], phases, {}, {})
    expect(c.rows[0].cells.Backend.status).toBe('nowindow')
    expect(c.anyWindow).toBe(false)
  })

  it('demand 0 → none', () => {
    const phases = [phase(1, 'F1', '2026-08-10', '2026-08-14', [])]
    const c = buildCapacity([], phases, {}, {})
    expect(c.rows[0].cells.Backend.status).toBe('none')
  })

  // [ISPRAVKA P1-8.5] prozor bez ijednog radnog dana → jasan status 'nocapacity', ne lažni 'over'
  it('prozor samo vikend → nocapacity umesto over sa praznim brojem', () => {
    const phases = [phase(1, 'F1', '2026-08-15', '2026-08-16', ['A-1'])] // sub-ned
    const c = buildCapacity([task('A-1', { est: 13 * H })], phases, {}, { peoplePerStack: { Backend: 1 } })
    const cell = c.rows[0].cells.Backend
    expect(c.rows[0].workingDays).toBe(0)
    expect(cell.capacity).toBe(0)
    expect(cell.load).toBe(null)
    expect(cell.status).toBe('nocapacity')
    expect(c.rows[0].worst).toBe('nocapacity')
  })

  it('done taskovi ne prave demand (remaining basis)', () => {
    const phases = [phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1'])]
    const c = buildCapacity([task('A-1', { est: 13 * H, spent: 13 * H, statusCategory: 'done' })], phases, {}, { peoplePerStack: { Backend: 1 } })
    expect(c.rows[0].cells.Backend.status).toBe('none')
  })
})

describe('buildCapacity — preklapanja (overallocation)', () => {
  it('dve preklopljene faze po 4h/dan za istu osobu → upozorenje', () => {
    const phases = [
      phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1']),
      phase(2, 'F2', '2026-08-10', '2026-08-14', ['B-1']),
    ]
    const tasks = [
      task('A-1', { est: 20 * H, assignee: 'Ana' }), // 4h/dan
      task('B-1', { est: 20 * H, assignee: 'Ana' }),
    ]
    const c = buildCapacity(tasks, phases, {}, {})
    expect(c.warnings).toHaveLength(1)
    expect(c.warnings[0].person).toBe('Ana')
    expect(c.warnings[0].perDay).toBeCloseTo(8)
    expect(c.warnings[0].over).toBeCloseTo(1.5)
  })

  it('faze bez preklapanja ne prave upozorenje', () => {
    const phases = [
      phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1']),
      phase(2, 'F2', '2026-08-17', '2026-08-21', ['B-1']),
    ]
    const tasks = [
      task('A-1', { est: 20 * H, assignee: 'Ana' }),
      task('B-1', { est: 20 * H, assignee: 'Ana' }),
    ]
    const c = buildCapacity(tasks, phases, {}, {})
    expect(c.warnings).toHaveLength(0)
  })

  // [ISPRAVKA P1-8.6] opterećenje se sabira preko SVIH aktivnih faza, ne parno
  it('tri paralelne faze po 3h/dan → upozorenje sa 9h/dan', () => {
    const phases = [
      phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1']),
      phase(2, 'F2', '2026-08-10', '2026-08-14', ['B-1']),
      phase(3, 'F3', '2026-08-10', '2026-08-14', ['C-1']),
    ]
    const tasks = [
      task('A-1', { est: 15 * H, assignee: 'Ana' }), // 3h/dan
      task('B-1', { est: 15 * H, assignee: 'Ana' }),
      task('C-1', { est: 15 * H, assignee: 'Ana' }),
    ]
    const c = buildCapacity(tasks, phases, {}, {})
    expect(c.warnings).toHaveLength(1)
    expect(c.warnings[0].perDay).toBeCloseTo(9)
    expect(c.warnings[0].phases).toHaveLength(3)
  })

  it('delimično preklopljene faze: najgori segment određuje upozorenje', () => {
    const phases = [
      phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1']),
      phase(2, 'F2', '2026-08-12', '2026-08-18', ['B-1']),
    ]
    const tasks = [
      task('A-1', { est: 20 * H, assignee: 'Ana' }), // 4h/dan u F1
      task('B-1', { est: 20 * H, assignee: 'Ana' }), // 4h/dan u F2
    ]
    const c = buildCapacity(tasks, phases, {}, {})
    expect(c.warnings).toHaveLength(1)
    expect(c.warnings[0].perDay).toBeCloseTo(8)
  })

  it('Neraspoređeno se ne računa u preklapanja', () => {
    const phases = [
      phase(1, 'F1', '2026-08-10', '2026-08-14', ['A-1']),
      phase(2, 'F2', '2026-08-10', '2026-08-14', ['B-1']),
    ]
    const tasks = [
      task('A-1', { est: 30 * H, assignee: null }),
      task('B-1', { est: 30 * H, assignee: null }),
    ]
    const c = buildCapacity(tasks, phases, {}, {})
    expect(c.warnings).toHaveLength(0)
  })
})
