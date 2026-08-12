// P2-E2: konfigurabilni pragovi — promena podešavanja menja obračun,
// bez podešavanja sve radi kao pre (defaulti identični starim konstantama).

import { describe, it, expect, afterEach } from 'vitest'
import { setCalcConfig, getCalcConfig, resetCalcConfig, CALC_DEFAULTS } from '../client/src/utils/calcConfig.js'
import { processEpicData } from '../client/src/utils.js'
import { remainingOf } from '../client/src/utils/stacks.js'
import { buildCapacity } from '../client/src/utils/capacity.js'

const H = 3600

afterEach(() => resetCalcConfig())

function parent(key, est, spent) {
  return { key, fields: { summary: key, status: { name: 'In Progress' }, issuetype: { subtask: false }, timeoriginalestimate: est, timespent: spent, subtasks: [] } }
}

describe('calcConfig', () => {
  it('defaulti su identični starim konstantama', () => {
    expect(CALC_DEFAULTS).toEqual({ overrunThresholdPct: 15, capacityTightPct: 85, overrunTailPct: 10 })
  })

  it('nevalidne vrednosti se ignorišu', () => {
    setCalcConfig({ overrunThresholdPct: 'xx', capacityTightPct: -5, overrunTailPct: 300 })
    expect(getCalcConfig()).toEqual(CALC_DEFAULTS)
  })

  it('prag prekoračenja menja over flag', () => {
    const tasks = [parent('A-1', 100 * H, 110 * H)] // 10% preko
    expect(processEpicData(tasks, []).overTasks).toHaveLength(0) // default 15%
    setCalcConfig({ overrunThresholdPct: 5 })
    expect(processEpicData(tasks, []).overTasks).toHaveLength(1)
  })

  it('rep preostalog rada prati overrunTailPct', () => {
    expect(remainingOf('inprog', 10 * H, 15 * H)).toBe(1 * H) // default 10%
    setCalcConfig({ overrunTailPct: 20 })
    expect(remainingOf('inprog', 10 * H, 15 * H)).toBe(2 * H)
  })

  it('capacityTightPct menja granicu tight statusa', () => {
    const phases = [{ id: 1, name: 'F1', start_date: '2026-08-10', due_date: '2026-08-14', taskKeys: ['A-1'] }]
    const task = { key: 'A-1', est: 20 * H, spent: 0, statusCategory: 'todo', components: ['Backend'], assignee: 'Ana', subtasks: [] }
    // load = 20 / 32.5 ≈ 0.615 → default: ok
    expect(buildCapacity([task], phases, {}, { peoplePerStack: { Backend: 1 } }).rows[0].cells.Backend.status).toBe('ok')
    setCalcConfig({ capacityTightPct: 50 })
    expect(buildCapacity([task], phases, {}, { peoplePerStack: { Backend: 1 } }).rows[0].cells.Backend.status).toBe('tight')
  })
})
