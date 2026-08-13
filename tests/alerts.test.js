// P3-3: testovi detekcije upozorenja — pragovi, dedup, publika (klijent ne
// dobija interne operativne alarme). db i mailer su mokovani.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/db.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, user_id INTEGER, epic_key TEXT, display_name TEXT);
    CREATE TABLE project_clients (id INTEGER PRIMARY KEY, project_id INTEGER, client_user_id INTEGER);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE phases (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, due_date TEXT);
    CREATE TABLE phase_tasks (id INTEGER PRIMARY KEY, phase_id INTEGER, project_id INTEGER, task_key TEXT);
    CREATE TABLE project_snapshots (project_id INTEGER, day TEXT, payload TEXT);
    CREATE TABLE alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT DEFAULT 'project', project_id INTEGER,
      type TEXT, threshold REAL, channel TEXT DEFAULT 'in_app', audience TEXT DEFAULT 'internal',
      enabled INTEGER DEFAULT 1, created_by INTEGER, created_at TEXT,
      UNIQUE(scope, project_id, type)
    );
    CREATE TABLE alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id INTEGER, project_id INTEGER, type TEXT,
      severity TEXT, title TEXT, body TEXT, dedup_key TEXT UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, acknowledged_by INTEGER, acknowledged_at TEXT
    );
    CREATE TABLE alert_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id INTEGER, user_id INTEGER,
      channel TEXT, delivered_at TEXT DEFAULT CURRENT_TIMESTAMP, read_at TEXT
    );
  `)
  return { default: db }
})

vi.mock('../server/aiUsage/mailer.js', () => ({
  mailConfigured: () => false,
  sendMail: async () => ({ ok: false, skipped: true }),
}))

import db from '../server/db.js'
import { detectForProject, notifyNewRelease, effectiveRule } from '../server/alerts/detector.js'

const PROJECT = { id: 10, display_name: 'Test projekat', epic_key: 'EP-1' }

beforeEach(() => {
  for (const t of ['alerts', 'alert_deliveries', 'alert_rules', 'phases', 'phase_tasks', 'project_snapshots', 'projects', 'users', 'project_clients', 'app_settings']) {
    db.prepare(`DELETE FROM ${t}`).run()
  }
  db.prepare("INSERT INTO users VALUES (1, 'Vlasnik', 'owner@x.com')").run()
  db.prepare("INSERT INTO users VALUES (2, 'Klijent', 'client@x.com')").run()
  db.prepare("INSERT INTO projects VALUES (10, 1, 'EP-1', 'Test projekat')").run()
  db.prepare('INSERT INTO project_clients VALUES (1, 10, 2)').run()
})

const processed = over => ({
  total: 10, done: 3, inprog: 4, testing: 0, todo: 3,
  totalEst: 100 * 3600, totalSpent: (over ? 130 : 90) * 3600,
  tasks: [{ key: 'EP-2', statusCategory: 'inprog' }, { key: 'EP-3', statusCategory: 'done' }],
})

describe('overrun', () => {
  it('okida iznad praga i NE ponavlja se (dedup po mesecu)', async () => {
    const first = await detectForProject(PROJECT, { processed: processed(true) })
    expect(first.length).toBe(1)
    expect(first[0].created).toBe(true)

    const again = await detectForProject(PROJECT, { processed: processed(true) })
    expect(again.length).toBe(0)

    const alerts = db.prepare("SELECT * FROM alerts WHERE type = 'overrun'").all()
    expect(alerts.length).toBe(1)
    // interna publika: isporuka vlasniku, NE klijentu
    const deliveries = db.prepare('SELECT user_id FROM alert_deliveries WHERE alert_id = ?').all(alerts[0].id)
    expect(deliveries.map(d => d.user_id)).toEqual([1])
  })

  it('ispod praga ne okida', async () => {
    const r = await detectForProject(PROJECT, { processed: processed(false) })
    expect(r.length).toBe(0)
  })

  it('poštuje prag iz pravila po projektu', async () => {
    db.prepare("INSERT INTO alert_rules (scope, project_id, type, threshold) VALUES ('project', 10, 'overrun', 50)").run()
    // 30% preko — ispod praga od 50%
    const r = await detectForProject(PROJECT, { processed: processed(true) })
    expect(r.length).toBe(0)
  })
})

describe('phase_delay', () => {
  it('okida za fazu sa prošlim rokom i nezavršenim taskovima; dedup po (faza, rok)', async () => {
    db.prepare("INSERT INTO phases VALUES (5, 10, 'Faza 1', '2020-01-01')").run()
    db.prepare("INSERT INTO phase_tasks VALUES (1, 5, 10, 'EP-2')").run() // inprog

    const first = await detectForProject(PROJECT, { processed: processed(false) })
    expect(first.some(r => r.created)).toBe(true)
    const again = await detectForProject(PROJECT, { processed: processed(false) })
    expect(again.length).toBe(0)
  })

  it('ne okida ako su svi taskovi faze završeni', async () => {
    db.prepare("INSERT INTO phases VALUES (5, 10, 'Faza 1', '2020-01-01')").run()
    db.prepare("INSERT INTO phase_tasks VALUES (1, 5, 10, 'EP-3')").run() // done
    const r = await detectForProject(PROJECT, { processed: processed(false) })
    expect(r.length).toBe(0)
  })
})

describe('no_activity', () => {
  it('okida kad utrošeno stoji duže od praga', async () => {
    const p = processed(false)
    const oldDay = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
    db.prepare('INSERT INTO project_snapshots VALUES (10, ?, ?)').run(oldDay, JSON.stringify({ totalSpent: p.totalSpent }))
    const r = await detectForProject(PROJECT, { processed: p })
    expect(r.some(x => x.created)).toBe(true)
    expect(db.prepare("SELECT COUNT(*) n FROM alerts WHERE type = 'no_activity'").get().n).toBe(1)
  })

  it('ne okida kad ima novog rada', async () => {
    const p = processed(false)
    const oldDay = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
    db.prepare('INSERT INTO project_snapshots VALUES (10, ?, ?)').run(oldDay, JSON.stringify({ totalSpent: p.totalSpent - 3600 }))
    const r = await detectForProject(PROJECT, { processed: p })
    expect(r.length).toBe(0)
  })
})

describe('new_release', () => {
  it('klijent dobija isporuku, dedup po noteId', async () => {
    const first = await notifyNewRelease({ noteId: 77, projectId: 10, title: 'v2.0' })
    expect(first.created).toBe(true)
    const again = await notifyNewRelease({ noteId: 77, projectId: 10, title: 'v2.0' })
    expect(again.created).toBe(false)

    const alert = db.prepare("SELECT * FROM alerts WHERE type = 'new_release'").get()
    const deliveries = db.prepare('SELECT user_id FROM alert_deliveries WHERE alert_id = ?').all(alert.id)
    expect(deliveries.map(d => d.user_id)).toEqual([2]) // samo klijent
  })
})

describe('effectiveRule', () => {
  it('projekat > global > default', () => {
    expect(effectiveRule(10, 'overrun').audience).toBe('internal') // default
    db.prepare("INSERT INTO alert_rules (scope, project_id, type, audience) VALUES ('global', NULL, 'overrun', 'both')").run()
    expect(effectiveRule(10, 'overrun').audience).toBe('both') // global
    db.prepare("INSERT INTO alert_rules (scope, project_id, type, audience) VALUES ('project', 10, 'overrun', 'internal')").run()
    expect(effectiveRule(10, 'overrun').audience).toBe('internal') // project
  })
})
