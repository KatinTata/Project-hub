// Testovi za client/src/utils/portal.js — tempo i vremenska osa klijentskog
// portala. Fiksan "today" da bi rezultati bili deterministički.

import { describe, it, expect } from 'vitest'
import { computeVelocity, buildTimeline } from '../client/src/utils/portal.js'

const TODAY = '2026-09-14'

// Niz snimaka: po jedan na svakih `stepDays` dana unazad od `TODAY`.
function snaps(list) {
  return list.map(([day, total, done]) => ({ day, total, done }))
}

describe('computeVelocity — tempo bez projekcije datuma', () => {
  it('računa završene stavke i nedeljni prosek u prozoru od 30 dana', () => {
    const v = computeVelocity(snaps([
      ['2026-08-15', 100, 20],
      ['2026-09-14', 100, 50],
    ]), { today: TODAY })
    expect(v.enough).toBe(true)
    expect(v.completed).toBe(30)
    expect(v.spanDays).toBe(30)
    expect(v.perWeek).toBe(7) // 30 / 30 * 7
    expect(v.remaining).toBe(50)
  })

  it('ne vraća nijedan datum završetka (odluka 14.09.2026.)', () => {
    const v = computeVelocity(snaps([['2026-08-15', 100, 20], ['2026-09-14', 100, 50]]), { today: TODAY })
    expect(Object.keys(v)).not.toContain('eta')
    expect(Object.keys(v)).not.toContain('projectedEnd')
  })

  it('osnova je prvi snimak U prozoru, stariji se ignorišu', () => {
    const v = computeVelocity(snaps([
      ['2026-01-01', 100, 0],   // van prozora
      ['2026-08-20', 100, 40],  // osnova
      ['2026-09-14', 100, 60],
    ]), { today: TODAY })
    expect(v.from).toBe('2026-08-20')
    expect(v.completed).toBe(20)
  })

  it('kad je sva istorija starija od prozora, uzima najstariji snimak', () => {
    const v = computeVelocity(snaps([
      ['2026-06-01', 80, 10],
      ['2026-07-01', 80, 24],
    ]), { today: TODAY })
    expect(v.enough).toBe(true)
    expect(v.from).toBe('2026-06-01')
    expect(v.completed).toBe(14)
  })

  it('manje od 7 dana istorije nije tempo nego šum', () => {
    const v = computeVelocity(snaps([['2026-09-10', 50, 5], ['2026-09-14', 50, 9]]), { today: TODAY })
    expect(v.enough).toBe(false)
  })

  it('jedan snimak ili prazno ne daje tempo', () => {
    expect(computeVelocity(snaps([['2026-09-14', 50, 5]]), { today: TODAY }).enough).toBe(false)
    expect(computeVelocity([], { today: TODAY }).enough).toBe(false)
    expect(computeVelocity(null, { today: TODAY }).enough).toBe(false)
  })

  it('smanjenje obima ne daje negativan tempo', () => {
    const v = computeVelocity(snaps([['2026-08-10', 100, 60], ['2026-09-14', 70, 45]]), { today: TODAY })
    expect(v.completed).toBe(0)
    expect(v.perWeek).toBe(0)
    expect(v.remaining).toBe(25)
  })

  it('snimci iz budućnosti se ignorišu', () => {
    const v = computeVelocity(snaps([
      ['2026-08-15', 100, 20],
      ['2026-09-14', 100, 50],
      ['2026-09-20', 100, 90],
    ]), { today: TODAY })
    expect(v.to).toBe('2026-09-14')
    expect(v.completed).toBe(30)
  })

  it('prazan projekat (total 0) se ne računa', () => {
    const v = computeVelocity(snaps([['2026-08-01', 0, 0], ['2026-09-14', 0, 0]]), { today: TODAY })
    expect(v.enough).toBe(false)
  })
})

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
