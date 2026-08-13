// P3-2: testovi za logiku perioda i dedup automatskih izveštaja.
// db se mockuje in-memory bazom (isti šablon kao fx/pricing testovi).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/db.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, user_id INTEGER, epic_key TEXT, display_name TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE project_clients (id INTEGER PRIMARY KEY, project_id INTEGER, client_user_id INTEGER);
    CREATE TABLE project_snapshots (project_id INTEGER, day TEXT, payload TEXT);
    CREATE TABLE published_notes (id INTEGER PRIMARY KEY, project_id INTEGER, title TEXT, version TEXT, status TEXT, created_at TEXT, released_at TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, project_id INTEGER, created_at TEXT);
    CREATE TABLE phases (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, position INTEGER DEFAULT 0, due_date TEXT);
    CREATE TABLE phase_tasks (id INTEGER PRIMARY KEY, phase_id INTEGER, project_id INTEGER, task_key TEXT);
    CREATE TABLE report_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, cadence TEXT DEFAULT 'weekly',
      day_of_week INTEGER DEFAULT 1, day_of_month INTEGER DEFAULT 1, hour INTEGER DEFAULT 8,
      timezone TEXT, format TEXT, recipients_mode TEXT DEFAULT 'clients', enabled INTEGER DEFAULT 1,
      created_by INTEGER, created_at TEXT
    );
    CREATE TABLE report_recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, email TEXT);
    CREATE TABLE report_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, project_id INTEGER, period TEXT,
      ran_at TEXT DEFAULT CURRENT_TIMESTAMP, status TEXT, file_path TEXT,
      recipients_count INTEGER DEFAULT 0, audience TEXT DEFAULT 'clients', error_message TEXT,
      UNIQUE(schedule_id, period)
    );
  `)
  return { default: db }
})

vi.mock('../server/aiUsage/mailer.js', () => ({
  mailConfigured: () => false,
  sendMail: async () => ({ ok: false, skipped: true }),
}))

import db from '../server/db.js'
import { periodFor, runReportSchedule } from '../server/reports/reportRunner.js'
import { buildProgressReportData, renderProgressReportHtml } from '../server/reports/progressReport.js'

beforeEach(() => {
  for (const t of ['report_runs', 'report_schedules', 'project_snapshots', 'published_notes', 'projects', 'users', 'project_clients', 'phases']) {
    db.prepare(`DELETE FROM ${t}`).run()
  }
  db.prepare("INSERT INTO users (id, name, email) VALUES (1, 'Vlasnik', 'owner@intelisale.com')").run()
  db.prepare("INSERT INTO projects (id, user_id, epic_key, display_name) VALUES (10, 1, 'EP-1', 'Test projekat')").run()
})

describe('periodFor', () => {
  it('nedeljni period = prethodnih 7 dana zaključno sa jučerašnjim', () => {
    const p = periodFor({ cadence: 'weekly' }, new Date('2026-08-10T08:00:00')) // ponedeljak
    expect(p.start).toBe('2026-08-03')
    expect(p.end).toBe('2026-08-09')
    expect(p.key).toMatch(/^2026-W\d{2}$/)
  })

  it('mesečni period = prethodni kalendarski mesec', () => {
    const p = periodFor({ cadence: 'monthly' }, new Date('2026-08-01T08:00:00'))
    expect(p.key).toBe('2026-07')
    expect(p.start).toBe('2026-07-01')
    expect(p.end).toBe('2026-07-31')
  })

  it('isti kadenca+datum daju isti ključ (osnova dedup-a)', () => {
    const a = periodFor({ cadence: 'weekly' }, new Date('2026-08-12T09:00:00'))
    const b = periodFor({ cadence: 'weekly' }, new Date('2026-08-12T23:00:00'))
    expect(a.key).toBe(b.key)
  })
})

describe('runReportSchedule dedup', () => {
  it('drugi pokušaj za isti period se preskače', async () => {
    const sid = db.prepare("INSERT INTO report_schedules (project_id, cadence, recipients_mode) VALUES (10, 'weekly', 'internal')").run().lastInsertRowid
    const schedule = db.prepare('SELECT * FROM report_schedules WHERE id = ?').get(sid)

    const first = await runReportSchedule(schedule)
    expect(first.skipped).toBeUndefined()
    expect(first.status).toBe('ok')

    const second = await runReportSchedule(schedule)
    expect(second.skipped).toBe(true)

    const runs = db.prepare('SELECT * FROM report_runs WHERE schedule_id = ?').all(sid)
    expect(runs.length).toBe(1)
  })

  it('ručno slanje (period NULL) prolazi više puta', async () => {
    const sid = db.prepare("INSERT INTO report_schedules (project_id, cadence, recipients_mode) VALUES (10, 'weekly', 'internal')").run().lastInsertRowid
    const schedule = db.prepare('SELECT * FROM report_schedules WHERE id = ?').get(sid)

    const a = await runReportSchedule(schedule, { manual: true })
    const b = await runReportSchedule(schedule, { manual: true })
    expect(a.status).toBe('ok')
    expect(b.status).toBe('ok')
    expect(db.prepare('SELECT COUNT(*) n FROM report_runs').get().n).toBe(2)
  })
})

describe('progressReport profili', () => {
  beforeEach(() => {
    db.prepare("INSERT INTO project_snapshots (project_id, day, payload) VALUES (10, '2026-08-01', ?)")
      .run(JSON.stringify({ total: 10, done: 2, inprog: 3, testing: 0, todo: 5, totalEst: 360000, totalSpent: 72000, remainingEst: 288000, billableSpent: 36000 }))
    db.prepare("INSERT INTO project_snapshots (project_id, day, payload) VALUES (10, '2026-08-09', ?)")
      .run(JSON.stringify({ total: 10, done: 6, inprog: 2, testing: 1, todo: 1, totalEst: 360000, totalSpent: 180000, remainingEst: 144000, billableSpent: 90000 }))
  })

  it('klijentski profil NE sadrži interne sate', () => {
    const data = buildProgressReportData(10, { periodStart: '2026-08-03', periodEnd: '2026-08-09', profile: 'client' })
    const html = renderProgressReportHtml(data)
    expect(html).toContain('Test projekat')
    expect(html).toContain('60%') // 6/10
    expect(html).not.toContain('Utrošeno')
    expect(html).not.toContain('Estimirano')
    expect(html).not.toContain('Interni pregled')
  })

  it('interni profil sadrži sate i delta napretka', () => {
    const data = buildProgressReportData(10, { periodStart: '2026-08-01', periodEnd: '2026-08-09', profile: 'internal' })
    const html = renderProgressReportHtml(data)
    expect(html).toContain('Interni pregled')
    expect(html).toContain('Utrošeno')
    expect(html).toContain('100 h')  // totalEst 360000s = 100h
    expect(html).toContain('+40 pp') // 20% → 60%
  })
})
