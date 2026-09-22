// Testovi za client/src/utils/portal.js — vremenska osa klijentskog portala.
// Fiksan "today" da bi rezultati bili deterministički.

import { describe, it, expect } from 'vitest'
import { buildTimeline } from '../client/src/utils/portal.js'

const TODAY = '2026-09-14'

describe('buildTimeline — vremenska osa faza', () => {
  const done = k => ({ key: k, statusCategory: 'done' })
  const open = k => ({ key: k, statusCategory: 'todo' })

  it('faza bez roka ne ulazi na osu', () => {
    const tl = buildTimeline([{ id: 1, name: 'Bez roka' }], {}, { today: TODAY })
    expect(tl).toBe(null)
  })

  it('lančanje: faza bez početka kreće od roka prethodne', () => {
    const tl = buildTimeline([
      { id: 1, name: 'Analiza', start_date: '2026-08-01', due_date: '2026-08-31' },
      { id: 2, name: 'Razvoj', due_date: '2026-10-15' },
    ], {}, { today: TODAY })
    expect(tl.rows[1].start).toBe('2026-08-31')
    expect(tl.start).toBe('2026-08-01')
    expect(tl.end).toBe('2026-10-15')
  })

  it('stanje faze: završena, kasni, u toku, buduća', () => {
    const tl = buildTimeline([
      { id: 1, name: 'Gotova', start_date: '2026-07-01', due_date: '2026-07-31' },
      { id: 2, name: 'Kasni', start_date: '2026-08-01', due_date: '2026-08-31' },
      { id: 3, name: 'U toku', start_date: '2026-09-01', due_date: '2026-09-30' },
      { id: 4, name: 'Buduća', start_date: '2026-10-01', due_date: '2026-10-31' },
    ], {
      1: [done('A-1'), done('A-2')],
      2: [done('B-1'), open('B-2')],
      3: [open('C-1')],
      4: [open('D-1')],
    }, { today: TODAY })

    expect(tl.rows.map(r => r.state)).toEqual(['done', 'late', 'active', 'future'])
    expect(tl.rows[0].pct).toBe(100)
    expect(tl.rows[1].pct).toBe(50)
  })

  it('marker "danas" je unutar ose i osa se produžava kad danas ispada iz plana', () => {
    const tl = buildTimeline([{ id: 1, name: 'Faza', start_date: '2026-06-01', due_date: '2026-06-30' }], {}, { today: TODAY })
    expect(tl.end).toBe(TODAY)
    expect(tl.todayPct).toBeCloseTo(100)
    expect(tl.rows[0].leftPct).toBe(0)
  })

  it('pokvaren unos (početak posle roka) ne pravi traku unazad', () => {
    const tl = buildTimeline([{ id: 1, name: 'X', start_date: '2026-10-01', due_date: '2026-09-01' }], {}, { today: TODAY })
    expect(tl.rows[0].start).toBe('2026-09-01')
    expect(tl.rows[0].widthPct).toBeGreaterThan(0)
  })
})
