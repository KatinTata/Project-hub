import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(path.join(dataDir, 'tracker.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Migracioni sistem (P2-D1) ────────────────────────────────────────────────
// Šema evoluira ISKLJUČIVO aditivno. Dva mehanizma:
//  - addColumn(table, col, ddl): ALTER samo ako kolona ne postoji (PRAGMA
//    table_info). "Kolona već postoji" je legitiman preskok; svaka DRUGA
//    greška se loguje i BACA — server ne sme da se digne na polomljenoj šemi.
//  - runOnce(id, name, fn): numerisana jednokratna migracija kroz ledger
//    tabelu schema_migrations (za buduće data-migracije).
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)
}

function addColumn(table, col, ddl) {
  if (hasColumn(table, col)) return
  try {
    db.exec(ddl)
    console.log(`[migracija] ${table}.${col} dodata`)
  } catch (err) {
    console.error(`[migracija] ${table}.${col} NEUSPEŠNA: ${err.message}`)
    throw err
  }
}

// eslint-disable-next-line no-unused-vars -- infrastruktura za buduće data-migracije
function runOnce(id, name, fn) {
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return
  try {
    fn()
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(id, name)
    console.log(`[migracija ${id}] ${name} primenjena`)
  } catch (err) {
    console.error(`[migracija ${id}] ${name} NEUSPEŠNA: ${err.message}`)
    throw err
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT DEFAULT 'admin',
    jira_url    TEXT,
    jira_email  TEXT,
    jira_token  TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    epic_key     TEXT NOT NULL,
    display_name TEXT,
    position     INTEGER DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, epic_key)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS project_clients (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(project_id, client_user_id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sender_id         INTEGER NOT NULL REFERENCES users(id),
    text              TEXT NOT NULL,
    task_key          TEXT DEFAULT NULL,
    task_summary      TEXT DEFAULT NULL,
    subject           TEXT DEFAULT NULL,
    recipient_user_id INTEGER DEFAULT NULL,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS message_reads (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(message_id, user_id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Security-relevant audit trail. No FK on user_id on purpose: deleting a user
// must NOT erase what they did.
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    action     TEXT NOT NULL,
    detail     TEXT,
    ip         TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Migrations for existing DBs (fail silently if column already exists)
addColumn('projects', 'archived', `ALTER TABLE projects ADD COLUMN archived INTEGER DEFAULT 0`)
addColumn('projects', 'archived_at', `ALTER TABLE projects ADD COLUMN archived_at TEXT`)
addColumn('users', 'role', `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'`)
addColumn('users', 'organization_id', `ALTER TABLE users ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`)
try { db.exec(`UPDATE users SET role = 'user' WHERE role = 'client'`) } catch {}
// Promote oldest admin to super_admin if no super_admin exists
try {
  const hasSuperAdmin = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'super_admin'").get().c
  if (hasSuperAdmin === 0) {
    db.prepare("UPDATE users SET role = 'super_admin' WHERE id = (SELECT MIN(id) FROM users WHERE role = 'admin')").run()
  }
} catch {}
addColumn('projects', 'filter_type', `ALTER TABLE projects ADD COLUMN filter_type TEXT DEFAULT 'epic'`)
addColumn('projects', 'filter_jql', `ALTER TABLE projects ADD COLUMN filter_jql TEXT`)
addColumn('projects', 'filter_meta', `ALTER TABLE projects ADD COLUMN filter_meta TEXT`)
addColumn('messages', 'task_key', `ALTER TABLE messages ADD COLUMN task_key TEXT DEFAULT NULL`)
addColumn('messages', 'recipient_user_id', `ALTER TABLE messages ADD COLUMN recipient_user_id INTEGER DEFAULT NULL`)
addColumn('messages', 'task_summary', `ALTER TABLE messages ADD COLUMN task_summary TEXT DEFAULT NULL`)
addColumn('messages', 'subject', `ALTER TABLE messages ADD COLUMN subject TEXT DEFAULT NULL`)
addColumn('users', 'anthropic_key', `ALTER TABLE users ADD COLUMN anthropic_key TEXT`)
// P1-11: revokacija sesija — inkrement pri promeni lozinke/role poništava stare JWT-ove
addColumn('users', 'token_version', `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`)

db.exec(`
  CREATE TABLE IF NOT EXISTS phases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#4F8EF7',
    position    INTEGER DEFAULT 0,
    due_date    TEXT DEFAULT NULL,
    start_date  TEXT DEFAULT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Legacy DBs whose `phases` predates these columns. Runs AFTER the CREATE so a
// fresh DB already has them (these then no-op); an old DB gets them added.
addColumn('phases', 'due_date', `ALTER TABLE phases ADD COLUMN due_date TEXT DEFAULT NULL`)
addColumn('phases', 'start_date', `ALTER TABLE phases ADD COLUMN start_date TEXT DEFAULT NULL`)

db.exec(`
  CREATE TABLE IF NOT EXISTS phase_tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id   INTEGER REFERENCES phases(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    task_key   TEXT NOT NULL,
    position   INTEGER DEFAULT 0,
    UNIQUE(project_id, task_key)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS published_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT UNIQUE NOT NULL,
    project_id INTEGER,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    html       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

addColumn('published_notes', 'status', `ALTER TABLE published_notes ADD COLUMN status TEXT DEFAULT 'published'`)
addColumn('published_notes', 'released_at', `ALTER TABLE published_notes ADD COLUMN released_at DATETIME`)
addColumn('published_notes', 'version', `ALTER TABLE published_notes ADD COLUMN version TEXT`)

db.exec(`
  CREATE TABLE IF NOT EXISTS document_sections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    position    INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    section_id    INTEGER REFERENCES document_sections(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_data     BLOB NOT NULL,
    file_size     INTEGER,
    thumbnail     TEXT,
    visible_to    TEXT DEFAULT 'all',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Migration: add file_path column for disk-based storage (replaces BLOB approach)
addColumn('documents', 'file_path', `ALTER TABLE documents ADD COLUMN file_path TEXT`)

db.exec(`
  CREATE TABLE IF NOT EXISTS release_note_sections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    position    INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS release_note_clients (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id        INTEGER NOT NULL REFERENCES published_notes(id) ON DELETE CASCADE,
    client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(note_id, client_user_id)
  )
`)

addColumn('published_notes', 'section_id', `ALTER TABLE published_notes ADD COLUMN section_id INTEGER REFERENCES release_note_sections(id) ON DELETE SET NULL`)

db.exec(`
  CREATE TABLE IF NOT EXISTS task_billable (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_key   TEXT NOT NULL,
    UNIQUE(project_id, task_key)
  )
`)

// Global app settings (key/value) — e.g. working-calendar config for capacity planning
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  )
`)

// Per-project team size per stack (capacity planning)
db.exec(`
  CREATE TABLE IF NOT EXISTS project_stack_people (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stack      TEXT NOT NULL,
    people     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (project_id, stack)
  )
`)

// Per-project curated team roster (named people assigned to a stack)
db.exec(`
  CREATE TABLE IF NOT EXISTS project_team (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    stack      TEXT NOT NULL,
    UNIQUE(project_id, name, stack)
  )
`)

// Daily project snapshots (history / trends) — one row per project per day
db.exec(`
  CREATE TABLE IF NOT EXISTS project_snapshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    day        TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, day)
  )
`)

// ── AI token usage tracking (spec: AI_TOKENI_MIGRACIJA_SPEC, proxy model) ─────

// External API configs (one row per service; agentic_admin is the usage source)
db.exec(`
  CREATE TABLE IF NOT EXISTS integration_api_configs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    service_key          TEXT UNIQUE NOT NULL,
    display_name         TEXT NOT NULL,
    base_url             TEXT NOT NULL DEFAULT '',
    auth_type            TEXT NOT NULL DEFAULT 'admin_key',
    service_password_enc TEXT,
    is_active            INTEGER DEFAULT 1,
    last_tested_at       DATETIME,
    last_test_ok         INTEGER,
    last_test_message    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)
db.prepare(`
  INSERT OR IGNORE INTO integration_api_configs (service_key, display_name, base_url, auth_type)
  VALUES ('agentic_admin', 'Agentic Admin API', 'https://intelisale-agentic.azurewebsites.net', 'admin_key')
`).run()

// Global pricing config — exactly ONE row (id fixed to 1)
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_pricing_config (
    id                 INTEGER PRIMARY KEY CHECK (id = 1),
    global_markup_pct  REAL NOT NULL DEFAULT 20,
    pricing_source_url TEXT NOT NULL DEFAULT 'https://prices.azure.com/api/retail/prices',
    last_synced_at     DATETIME,
    last_sync_ok       INTEGER,
    last_sync_message  TEXT,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)
db.prepare('INSERT OR IGNORE INTO ai_pricing_config (id) VALUES (1)').run()

// Per-model pricing (base Azure USD prices per 1M tokens + markups)
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_model_pricing (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name          TEXT NOT NULL UNIQUE,
    input_price_per_1m  REAL NOT NULL DEFAULT 0,
    output_price_per_1m REAL NOT NULL DEFAULT 0,
    model_markup_pct    REAL NOT NULL DEFAULT 0,
    source              TEXT NOT NULL DEFAULT 'azure',
    is_active           INTEGER DEFAULT 1,
    last_synced_at      DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Audit of base-price changes (markup changes are NOT logged, per spec)
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_model_pricing_history (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name        TEXT NOT NULL,
    old_input_per_1m  REAL,
    new_input_per_1m  REAL,
    old_output_per_1m REAL,
    new_output_per_1m REAL,
    source            TEXT,
    changed_by        TEXT,
    changed_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)
db.exec('CREATE INDEX IF NOT EXISTS idx_ai_pricing_history_model ON ai_model_pricing_history (model_name, changed_at DESC)')

// NBS exchange rates (middle rate vs RSD)
db.exec(`
  CREATE TABLE IF NOT EXISTS ap_exchange_rates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    currency_from TEXT NOT NULL,
    currency_to   TEXT NOT NULL DEFAULT 'RSD',
    rate          REAL,
    rate_date     TEXT NOT NULL,
    source        TEXT,
    UNIQUE (currency_from, currency_to, rate_date)
  )
`)

// Tenant ↔ Project Hub client mapping (needed for the future client-facing view)
db.exec(`
  CREATE TABLE IF NOT EXISTS client_tenant_mappings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    client_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tenant_id        TEXT NOT NULL UNIQUE,
    tenant_name      TEXT,
    tenant_code      TEXT,
    sl_tenant_guid   TEXT,
    eproc_tenant_guid TEXT,
    is_active        INTEGER DEFAULT 1,
    auto_discovered  INTEGER DEFAULT 0,
    notes            TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Tenant ↔ client users: many-to-many (several client logins can see the same
// tenant's usage; one login can cover several tenants).
db.exec(`
  CREATE TABLE IF NOT EXISTS client_tenant_users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (tenant_id, user_id)
  )
`)
// One-time migration of legacy single-user links into the junction table
db.prepare(`
  INSERT OR IGNORE INTO client_tenant_users (tenant_id, user_id)
  SELECT tenant_id, client_user_id FROM client_tenant_mappings WHERE client_user_id IS NOT NULL
`).run()

// Monthly spend budget per tenant (EUR) + early-warning threshold.
// sent_* columns hold the YYYY-MM already notified, so each alert fires once
// per calendar month.
db.exec(`
  CREATE TABLE IF NOT EXISTS tenant_budgets (
    tenant_id          TEXT PRIMARY KEY,
    monthly_limit_eur  REAL,
    warning_pct        REAL NOT NULL DEFAULT 80,
    notify_enabled     INTEGER NOT NULL DEFAULT 1,
    extra_emails       TEXT,
    warning_sent_month TEXT,
    limit_sent_month   TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Manual "we actually work with this one" flag — survives tenant discovery
// (is_active mirrors the Agentic API's enabled flag and gets overwritten).
addColumn('client_tenant_mappings', 'is_tracked', `ALTER TABLE client_tenant_mappings ADD COLUMN is_tracked INTEGER DEFAULT 1`)
// Cena po zahtevu za pozive bez modela (MCP alati ne upisuju model ni tokene,
// pa bi im trošak bio 0) — USD, primenjuje se na svaki zahtev bez modelName.
addColumn('ai_pricing_config', 'tool_price_per_request', `ALTER TABLE ai_pricing_config ADD COLUMN tool_price_per_request REAL NOT NULL DEFAULT 0`)

// AI packages (tiers): fixed monthly access fee + included consumption.
// A tenant on a package gets its consumption limit from included_eur.
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_packages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    monthly_fee_eur REAL NOT NULL DEFAULT 0,
    included_eur    REAL NOT NULL DEFAULT 0,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)
addColumn('tenant_budgets', 'package_id', `ALTER TABLE tenant_budgets ADD COLUMN package_id INTEGER REFERENCES ai_packages(id)`)

// In-app budget notifications (email is optional / added later)
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_usage_alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   TEXT NOT NULL,
    tenant_name TEXT,
    level       TEXT NOT NULL,           -- 'warning' | 'limit'
    month       TEXT NOT NULL,           -- YYYY-MM
    spent_eur   REAL,
    limit_eur   REAL,
    pct         REAL,
    mail_sent   INTEGER DEFAULT 0,
    acked_at    DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, level, month)
  )
`)

// Automatski izveštaji (P3-2): raspored po projektu, primaoci za custom mode,
// istorija slanja sa dedup-om po (schedule, period) — restart ne šalje duplo.
db.exec(`
  CREATE TABLE IF NOT EXISTS report_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cadence         TEXT NOT NULL DEFAULT 'weekly',   -- 'weekly' | 'monthly'
    day_of_week     INTEGER DEFAULT 1,                -- 1=pon ... 7=ned
    day_of_month    INTEGER DEFAULT 1,
    hour            INTEGER DEFAULT 8,
    timezone        TEXT DEFAULT 'Europe/Belgrade',
    format          TEXT DEFAULT 'html',              -- v1: 'html'
    recipients_mode TEXT NOT NULL DEFAULT 'clients',  -- 'clients' | 'internal' | 'custom'
    enabled         INTEGER DEFAULT 1,
    created_by      INTEGER,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS report_recipients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES report_schedules(id) ON DELETE CASCADE,
    email       TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS report_runs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id      INTEGER REFERENCES report_schedules(id) ON DELETE SET NULL,
    project_id       INTEGER NOT NULL,
    period           TEXT,                            -- 'YYYY-Wnn' | 'YYYY-MM' | NULL za rucno
    ran_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    status           TEXT NOT NULL,                   -- 'ok' | 'error'
    file_path        TEXT,
    recipients_count INTEGER DEFAULT 0,
    audience         TEXT DEFAULT 'clients',
    error_message    TEXT,
    UNIQUE(schedule_id, period)
  )
`)

// Proaktivna upozorenja (P3-3). ai_usage_alerts OSTAJE zaseban izvor za AI
// budžete (ne duplira se); ovde su projektna upozorenja: overrun, kašnjenje
// faze, nema aktivnosti, nov release. dedup_key sprečava ponavljanje.
db.exec(`
  CREATE TABLE IF NOT EXISTS alert_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    scope      TEXT NOT NULL DEFAULT 'project',  -- 'project' | 'global'
    project_id INTEGER,                          -- NULL za global
    type       TEXT NOT NULL,                    -- 'overrun'|'phase_delay'|'no_activity'|'new_release'
    threshold  REAL,
    channel    TEXT NOT NULL DEFAULT 'in_app',   -- 'in_app' | 'email' | 'both'
    audience   TEXT NOT NULL DEFAULT 'internal', -- 'internal' | 'client' | 'both'
    enabled    INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scope, project_id, type)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id         INTEGER,
    project_id      INTEGER NOT NULL,
    type            TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'warning', -- 'info'|'warning'|'critical'
    title           TEXT NOT NULL,
    body            TEXT,
    dedup_key       TEXT UNIQUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_by INTEGER,
    acknowledged_at DATETIME
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS alert_deliveries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id     INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL,
    channel      TEXT NOT NULL DEFAULT 'in_app',
    delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at      DATETIME
  )
`)

// FAQ iz baze (P2-E1) — QAPage čita kroz API, admin menja bez deploya.
// answer je sanitizovan HTML (upis kroz /api/faq prolazi sanitize-html).
db.exec(`
  CREATE TABLE IF NOT EXISTS faq (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT NOT NULL,
    lang       TEXT NOT NULL DEFAULT 'sr',
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    keywords   TEXT DEFAULT '',
    position   INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// ── Indeksi (P1-13, aditivno) ────────────────────────────────────────────────
// Najčešći filteri/spajanja bez pokrivajućeg indeksa. UNIQUE ograničenja već
// pokrivaju: message_reads(message_id, user_id) PK — ali ne i upit samo po
// user_id; project_clients(project_id, client_user_id) — ali ne i upit samo po
// client_user_id; project_snapshots(project_id, day) je pokriven UNIQUE-om.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_project_created ON messages(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_message_reads_user ON message_reads(user_id);
  CREATE INDEX IF NOT EXISTS idx_project_clients_client ON project_clients(client_user_id);
  CREATE INDEX IF NOT EXISTS idx_phase_tasks_project ON phase_tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_phase_tasks_phase ON phase_tasks(phase_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_published_notes_user ON published_notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_published_notes_project ON published_notes(project_id);
  CREATE INDEX IF NOT EXISTS idx_ap_exchange_rates_lookup ON ap_exchange_rates(currency_from, currency_to, rate_date);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_alerts_month ON ai_usage_alerts(month);
  CREATE INDEX IF NOT EXISTS idx_faq_lang_cat ON faq(lang, category, position);
  CREATE INDEX IF NOT EXISTS idx_alerts_project ON alerts(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_alert_deliveries_user ON alert_deliveries(user_id, read_at);
`)

export default db
