// Izračuni za klijentski portal (P3-4). Sve se izvodi iz BROJA STAVKI i datuma
// faza — nijedan interni sat, procena ni ime izvršioca (server te podatke roli
// `user` i ne šalje). Funkcije su čiste da bi mogle da se testiraju.

import { parseLocalDate, toLocalIso } from './dates.js'
import { getStatusCategory } from '../utils.js'

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(fromIso, toIso) {
  return Math.round((parseLocalDate(toIso) - parseLocalDate(fromIso)) / DAY_MS)
}

// ── Tempo rada iz dnevnih snapshot-a ────────────────────────────────────────
// Odluka 14.09.2026.: prikazuje se tempo, NIKAD projektovan datum završetka.
//
// snapshots: [{ day: 'YYYY-MM-DD', total, done }] rastuće po danu (kako ih
// vraća GET /api/projects/:id/snapshots).
// Vraća: { enough, completed, perWeek, spanDays, remaining, total, done, from, to }
//   enough === false znači da nema dovoljno istorije za tvrdnju o tempu —
//   komponenta tada ne prikazuje ništa umesto da laže brojem.
export function computeVelocity(snapshots, { windowDays = 30, today = toLocalIso(new Date()) } = {}) {
  const rows = (snapshots || [])
    .filter(s => s && s.day && (s.total || 0) > 0)
    .filter(s => s.day <= today)
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))

  const empty = { enough: false, completed: 0, perWeek: 0, spanDays: 0, remaining: 0, total: 0, done: 0, from: null, to: null }
  if (rows.length < 2) return empty

  const last = rows[rows.length - 1]
  const windowStart = toLocalIso(new Date(parseLocalDate(today).getTime() - windowDays * DAY_MS))

  // Osnova je snimak vremenski NAJBLIŽI početku prozora (sa bilo koje strane).
  // Snimci se prave jednom dnevno, ali dani znaju da fale (projekat pauziran,
  // server restartovan), pa "prvi u prozoru" ume da bude i sam poslednji dan.
  const before = [...rows].reverse().find(s => s.day <= windowStart) || null
  const after = rows.find(s => s.day > windowStart) || null
  const dist = s => Math.abs(daysBetween(windowStart, s.day))
  let baseline = before && after ? (dist(after) < dist(before) ? after : before) : (before || after)

  // Ako je tako izabrana osnova prekratka (ili je i sama poslednji snimak),
  // pada se na najstariji poznati snimak — tempo se računa na onome što postoji.
  if (!baseline || daysBetween(baseline.day, last.day) < 7) baseline = rows[0]

  const spanDays = daysBetween(baseline.day, last.day)
  if (spanDays < 7) return empty // kraće od nedelje nije tempo, nego šum

  // Negativna razlika (stavke uklonjene iz obima) se ne prikazuje kao "minus
  // završeno" — tempo je 0, a klijent i dalje vidi ukupno stanje.
  const completed = Math.max(0, (last.done || 0) - (baseline.done || 0))
  const perWeek = Math.round((completed / spanDays) * 7 * 10) / 10

  return {
    enough: true,
    completed,
    perWeek,
    spanDays,
    remaining: Math.max(0, (last.total || 0) - (last.done || 0)),
    total: last.total || 0,
    done: last.done || 0,
    from: baseline.day,
    to: last.day,
  }
}

// ── Vremenska osa faza ──────────────────────────────────────────────────────
// Faza ulazi na osu samo ako ima `due_date`. Početak je `start_date`, a ako ga
// nema — rok prethodne faze na osi (lančano, kako se faze i planiraju); za prvu
// fazu bez početka uzima se dan njenog kreiranja ili sam rok (tačka umesto trake).
//
// tasksByPhase: { [phaseId]: [task] } — koristi se samo za procenat završenosti.
// Vraća: { start, end, todayPct, rows: [...] } ili null kad nema nijedne faze sa rokom.
export function buildTimeline(phases, tasksByPhase = {}, { today = toLocalIso(new Date()) } = {}) {
  const withDue = (phases || [])
    .filter(p => p.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
  if (!withDue.length) return null

  const bars = []
  let prevEnd = null
  for (const p of withDue) {
    const end = String(p.due_date).slice(0, 10)
    let start = p.start_date ? String(p.start_date).slice(0, 10) : (prevEnd || (p.created_at ? String(p.created_at).slice(0, 10) : end))
    if (start > end) start = end // pokvaren unos ne sme da napravi traku unazad
    prevEnd = end

    const list = tasksByPhase[p.id] || []
    const done = list.filter(x => x.statusCategory === 'done').length
    const pct = list.length ? Math.round((done / list.length) * 100) : 0
    const allDone = list.length > 0 && done === list.length

    const state = allDone ? 'done'
      : (end < today ? 'late'
        : (start <= today ? 'active' : 'future'))

    bars.push({ id: p.id, name: p.name, color: p.color || null, start, end, pct, done, total: list.length, state })
  }

  const start = bars.reduce((m, b) => (b.start < m ? b.start : m), bars[0].start)
  const end = bars.reduce((m, b) => (b.end > m ? b.end : m), bars[0].end)
  // Ako je "danas" van planiranog opsega, osa se produžava da marker uvek ima mesto.
  const axisStart = today < start ? today : start
  const axisEnd = today > end ? today : end
  const span = Math.max(1, daysBetween(axisStart, axisEnd))
  const pos = day => (daysBetween(axisStart, day) / span) * 100

  return {
    start: axisStart,
    end: axisEnd,
    spanDays: span,
    todayPct: pos(today),
    rows: bars.map(b => ({
      ...b,
      leftPct: pos(b.start),
      // Minimalna vidljiva širina da jednodnevna faza ne nestane sa ose.
      widthPct: Math.max(1.5, pos(b.end) - pos(b.start)),
    })),
  }
}

// ── Naziv statusa za klijenta ───────────────────────────────────────────────
// Klijent ne treba da uči interni Jira workflow ("In Review", "Waiting for
// deploy", "On Hold"). Sirov naziv se svodi na četiri klijentske reči preko
// već postojeće kategorizacije statusa; nepoznat status ide u "predstoji",
// isto kao u donut grafikonu.
export function clientStatusLabel(statusName, t) {
  const cat = getStatusCategory(statusName)
  if (cat === 'done') return t('portal.chart.done')
  if (cat === 'testing') return t('portal.chart.testing')
  if (cat === 'inprog') return t('portal.chart.inprog')
  return t('portal.chart.todo')
}
