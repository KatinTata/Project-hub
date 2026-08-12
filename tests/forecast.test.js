// Golden-master testovi za client/src/utils/forecast.js.
// Fiksni "today" (2026-08-10, ponedeljak) za determinističke datume.

import { describe, it, expect } from 'vitest'
import { buildPhaseForecast } from '../client/src/utils/forecast.js'
import { STACKS } from '../client/src/utils/stacks.js'

const H = 3600
const MONDAY = '2026-08-10'

function cells(overrides = {}) {
  const o = {}
  for (const s of STACKS) o[s] = { plan: 0, spent: 0, remaining: 0, ...(overrides[s] || {}) }
  return o
}

function matrix(rows) {
  return { stacks: STACKS, rows }
}

describe('buildPhaseForecast — man-days i trajanje', () => {
  it('13h remaining / 6.5h dan = 2 man-days = 2 radna dana za 1 osobu', () => {
    const m = matrix([{ phaseId: '1', phaseName: 'Faza 1', cells: cells({ Backend: { remaining: 13 * H } }) }])
    const f = buildPhaseForecast(m, { workdayHours: 6.5, workdaysPerWeek: 5 }, { today: MONDAY })
    expect(f.phases[0].stackManDays.Backend).toBeCloseTo(2)
    expect(f.phases[0].durationWorkingDays).toBe(2)
    expect(f.phases[0].start).toBe('2026-08-10')
    expect(f.phases[0].end).toBe('2026-08-11')
    expect(f.projectEnd).toBe('2026-08-11')
    expect(f.grandManDays).toBeCloseTo(2)
  })

  it('više ljudi skraćuje trajanje: 2 man-days / 2 osobe = 1 dan', () => {
    const m = matrix([{ phaseId: '1', phaseName: 'F1', cells: cells({ Backend: { remaining: 13 * H } }) }])
    const f = buildPhaseForecast(m, {}, { today: MONDAY, peoplePerStackMap: { Backend: 2 } })
    expect(f.phases[0].durationWorkingDays).toBe(1)
  })

  it('trajanje faze = najduži stek (stekovi paralelno)', () => {
    const m = matrix([{
      phaseId: '1', phaseName: 'F1',
      cells: cells({ Backend: { remaining: 13 * H }, Frontend: { remaining: 32.5 * H } }),
    }])
    const f = buildPhaseForecast(m, {}, { today: MONDAY })
    expect(f.phases[0].durationWorkingDays).toBe(5) // Frontend 5 dana > Backend 2
    expect(f.phases[0].totalManDays).toBeCloseTo(7)
  })

  it('basis=plan koristi plan umesto remaining', () => {
    const m = matrix([{
      phaseId: '1', phaseName: 'F1',
      cells: cells({ Backend: { plan: 13 * H, remaining: 0 } }),
    }])
    const rem = buildPhaseForecast(m, {}, { today: MONDAY })
    const plan = buildPhaseForecast(m, {}, { today: MONDAY, basis: 'plan' })
    expect(rem.phases[0].empty).toBe(true)
    expect(plan.phases[0].durationWorkingDays).toBe(2)
  })
})

describe('buildPhaseForecast — lančanje faza', () => {
  it('faza 2 počinje kad se faza 1 završi', () => {
    const m = matrix([
      { phaseId: '1', phaseName: 'F1', cells: cells({ Backend: { remaining: 13 * H } }) },
      { phaseId: '2', phaseName: 'F2', cells: cells({ Backend: { remaining: 6.5 * H } }) },
    ])
    const f = buildPhaseForecast(m, {}, { today: MONDAY })
    expect(f.phases[0].end).toBe('2026-08-11')
    expect(f.phases[1].start).toBe('2026-08-12')
    expect(f.phases[1].end).toBe('2026-08-12')
    expect(f.totalWorkingDays).toBe(3)
  })

  it('vikend se preskače (5 radnih dana ponedeljak-petak, nastavak u ponedeljak)', () => {
    const m = matrix([
      { phaseId: '1', phaseName: 'F1', cells: cells({ Backend: { remaining: 32.5 * H } }) }, // 5 dana
      { phaseId: '2', phaseName: 'F2', cells: cells({ Backend: { remaining: 6.5 * H } }) },
    ])
    const f = buildPhaseForecast(m, {}, { today: MONDAY })
    expect(f.phases[0].end).toBe('2026-08-14') // petak
    expect(f.phases[1].start).toBe('2026-08-17') // ponedeljak
  })

  it('prazna faza ne troši kalendar', () => {
    const m = matrix([
      { phaseId: '1', phaseName: 'F1', cells: cells() },
      { phaseId: '2', phaseName: 'F2', cells: cells({ Backend: { remaining: 6.5 * H } }) },
    ])
    const f = buildPhaseForecast(m, {}, { today: MONDAY })
    expect(f.phases[0].empty).toBe(true)
    expect(Math.abs(f.phases[0].durationWorkingDays)).toBe(0) // Math.ceil(-1e-9) daje -0
    expect(f.phases[1].start).toBe('2026-08-10')
  })

  it('preskače sintetički red "none"', () => {
    const m = matrix([
      { phaseId: 'none', phaseName: 'Neraspoređeno', cells: cells({ Backend: { remaining: 100 * H } }) },
      { phaseId: '1', phaseName: 'F1', cells: cells({ Backend: { remaining: 6.5 * H } }) },
    ])
    const f = buildPhaseForecast(m, {}, { today: MONDAY })
    expect(f.phases).toHaveLength(1)
    expect(f.phases[0].phaseId).toBe('1')
  })
})

describe('buildPhaseForecast — defaulti i start', () => {
  it('default: 6.5h/dan, 5 dana/nedelja, 1 osoba po steku', () => {
    const f = buildPhaseForecast(matrix([]), {}, { today: MONDAY })
    expect(f.workdayHours).toBe(6.5)
    expect(f.workdaysPerWeek).toBe(5)
    expect(f.peoplePerStack).toBe(1)
  })

  it('subota se pomera na ponedeljak (snapForward)', () => {
    const f = buildPhaseForecast(matrix([{ phaseId: '1', phaseName: 'F1', cells: cells({ Backend: { remaining: 6.5 * H } }) }]), {}, { today: '2026-08-15' }) // subota
    expect(f.projectStart).toBe('2026-08-17') // ponedeljak
  })

  // [BUG P1-8.8 kontekst] bez peoplePerStackMap forecast pretpostavlja 1 osobu za svaki stek
  it('fallback broj ljudi je 1 za svaki stek (golden master)', () => {
    const m = matrix([{ phaseId: '1', phaseName: 'F1', cells: cells({ Mobile: { remaining: 13 * H }, Database: { remaining: 13 * H } }) }])
    const f = buildPhaseForecast(m, {}, { today: MONDAY, peoplePerStackMap: { Backend: 3 } })
    // Mobile i Database nisu u mapi → 1 osoba → 2 dana
    expect(f.phases[0].durationWorkingDays).toBe(2)
  })
})
