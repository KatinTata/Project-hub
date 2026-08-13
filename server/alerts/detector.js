// P3-3: detekcija i isporuka proaktivnih upozorenja. Poziva se iz dnevnog
// snapshot posla (tamo već postoje SVEŽI taskovi po projektu — bez dodatnih
// Jira poziva) i iz publish rute (nov release). dedup_key garantuje da se
// isti događaj ne ponavlja po ciklusima; AI budžeti ostaju u ai_usage_alerts.

import db from '../db.js'
import { sendMail, mailConfigured } from '../aiUsage/mailer.js'

// Ugrađeni defaulti — važe dok admin ne definiše pravilo (globalno ili po
// projektu). Klijent po difoltu dobija SAMO 'new_release'; operativni tipovi
// (overrun/kašnjenje/neaktivnost) idu internom timu.
const DEFAULT_RULES = {
  overrun:     { threshold: null, channel: 'in_app', audience: 'internal', severity: 'critical' },
  phase_delay: { threshold: 0,    channel: 'in_app', audience: 'internal', severity: 'warning' },
  no_activity: { threshold: 7,    channel: 'in_app', audience: 'internal', severity: 'info' },
  new_release: { threshold: null, channel: 'in_app', audience: 'client',  severity: 'info' },
}
export const ALERT_TYPES = Object.keys(DEFAULT_RULES)

function settingsNumber(key, fallback) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
  const n = Number(row?.value)
  return Number.isFinite(n) ? n : fallback
}

export function effectiveRule(projectId, type) {
  const specific = db.prepare(
    "SELECT * FROM alert_rules WHERE scope = 'project' AND project_id = ? AND type = ?"
  ).get(projectId, type)
  if (specific) return specific
  const global = db.prepare(
    "SELECT * FROM alert_rules WHERE scope = 'global' AND type = ?"
  ).get(type)
  if (global) return global
  const d = DEFAULT_RULES[type]
  return d ? { id: null, type, enabled: 1, ...d } : null
}

function audienceUsers(projectId, audience) {
  const users = []
  if (audience === 'internal' || audience === 'both') {
    const owner = db.prepare('SELECT u.id, u.email FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(projectId)
    if (owner) users.push(owner)
  }
  if (audience === 'client' || audience === 'both') {
    users.push(...db.prepare(`
      SELECT u.id, u.email FROM project_clients pc JOIN users u ON u.id = pc.client_user_id
      WHERE pc.project_id = ?
    `).all(projectId))
  }
  return users
}

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

function alertEmailHtml({ title, body, projectName, severity }) {
  const accent = severity === 'critical' ? '#DC2626' : severity === 'warning' ? '#EA580C' : '#2563EB'
  return `<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#F0F2F8;font-family:'Segoe UI',Arial,sans-serif;color:#0F1523">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#0b1a2f 0%,#0f2746 55%,#163e6b 100%);border-radius:16px;padding:26px 28px;color:#fff">
      <div style="font-size:11px;letter-spacing:0.16em;color:#38BDF8;margin-bottom:10px">INTELISALE &middot; PROJECT HUB</div>
      <div style="font-size:20px;font-weight:700;line-height:1.3;color:${accent === '#2563EB' ? '#fff' : '#FCA5A5'}">${esc(title)}</div>
      <div style="font-size:14px;color:#9FB2C9;margin-top:8px">${esc(projectName)}</div>
    </div>
    <div style="background:#fff;border:1px solid #E2E6F0;border-left:4px solid ${accent};border-radius:12px;padding:18px 22px;margin-top:14px;font-size:14px;line-height:1.6">
      ${esc(body)}
    </div>
    <div style="margin-top:18px;text-align:center;font-size:10px;color:#A0AABF;letter-spacing:0.1em">INTELISALE &middot; PROJECT INSIGHT HUB</div>
  </div>
</body></html>`
}

// Kreira alert (ako dedup dozvoli) + in-app isporuke + email po pravilu.
export async function createAlert({ rule, projectId, type, severity, title, body, dedupKey }) {
  let alertId
  try {
    alertId = db.prepare(`
      INSERT INTO alerts (rule_id, project_id, type, severity, title, body, dedup_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(rule.id, projectId, type, severity, title, body, dedupKey).lastInsertRowid
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return { created: false }
    throw e
  }

  const users = audienceUsers(projectId, rule.audience)
  const insertDelivery = db.prepare('INSERT INTO alert_deliveries (alert_id, user_id, channel) VALUES (?, ?, ?)')
  for (const u of users) insertDelivery.run(alertId, u.id, 'in_app')

  if ((rule.channel === 'email' || rule.channel === 'both') && users.length && mailConfigured()) {
    const projectName = db.prepare('SELECT COALESCE(display_name, epic_key) AS n FROM projects WHERE id = ?').get(projectId)?.n || ''
    await sendMail({
      to: users.map(u => u.email),
      subject: `[Project Hub] ${title}`,
      html: alertEmailHtml({ title, body, projectName, severity }),
    }).catch(() => {})
  }
  return { created: true, alertId }
}

// Detekcija za jedan projekat — poziva se sa svežim taskovima iz snapshot posla.
export async function detectForProject(project, { processed }) {
  const results = []
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)
  const projectName = project.display_name || project.epic_key

  // 1) Overrun na nivou projekta (konfigurabilan prag, P2-E2)
  const overrunRule = effectiveRule(project.id, 'overrun')
  if (overrunRule?.enabled) {
    const pct = overrunRule.threshold ?? settingsNumber('overrunThresholdPct', 15)
    if (processed.totalEst > 0 && processed.totalSpent > processed.totalEst * (1 + pct / 100)) {
      const overPct = Math.round(((processed.totalSpent - processed.totalEst) / processed.totalEst) * 100)
      results.push(await createAlert({
        rule: overrunRule, projectId: project.id, type: 'overrun', severity: 'critical',
        title: `Prekoračenje na projektu ${projectName}`,
        body: `Utrošeno je ${overPct}% više od ukupne estimacije (prag: ${pct}%).`,
        dedupKey: `overrun:${project.id}:${month}`,
      }))
    }
  }

  // 2) Kašnjenje faze: rok prošao, a neki task u fazi nije završen
  const delayRule = effectiveRule(project.id, 'phase_delay')
  if (delayRule?.enabled) {
    const phases = db.prepare('SELECT id, name, due_date FROM phases WHERE project_id = ? AND due_date IS NOT NULL').all(project.id)
    const doneKeys = new Set((processed.tasks || []).filter(t => t.statusCategory === 'done').map(t => t.key))
    for (const ph of phases) {
      if (ph.due_date >= today) continue
      const keys = db.prepare('SELECT task_key FROM phase_tasks WHERE phase_id = ?').all(ph.id).map(r => r.task_key)
      if (!keys.length || keys.every(k => doneKeys.has(k))) continue
      results.push(await createAlert({
        rule: delayRule, projectId: project.id, type: 'phase_delay', severity: 'warning',
        title: `Faza "${ph.name}" kasni (${projectName})`,
        body: `Rok ${ph.due_date} je prošao, a faza nije završena.`,
        dedupKey: `phase_delay:${ph.id}:${ph.due_date}`,
      }))
    }
  }

  // 3) Nema aktivnosti X dana: utrošeno se nije pomerilo u odnosu na snapshot
  const idleRule = effectiveRule(project.id, 'no_activity')
  if (idleRule?.enabled) {
    const days = idleRule.threshold ?? 7
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const old = db.prepare(
      'SELECT payload FROM project_snapshots WHERE project_id = ? AND day <= ? ORDER BY day DESC LIMIT 1'
    ).get(project.id, cutoff)
    if (old) {
      try {
        const prev = JSON.parse(old.payload)
        const isComplete = processed.total > 0 && processed.done === processed.total
        if (!isComplete && prev.totalSpent === processed.totalSpent && processed.total > 0) {
          const week = today // dedup po danu detekcije zaokružen na nedelju
          results.push(await createAlert({
            rule: idleRule, projectId: project.id, type: 'no_activity', severity: 'info',
            title: `Nema aktivnosti na projektu ${projectName}`,
            body: `Poslednjih ${days} dana nije zabeležen nijedan sat rada.`,
            dedupKey: `no_activity:${project.id}:${week.slice(0, 7)}-${Math.ceil(Number(week.slice(8, 10)) / 7)}`,
          }))
        }
      } catch { /* pokvaren payload — preskoči */ }
    }
  }

  return results.filter(r => r?.created)
}

// Nov release — poziva se iz publish rute; klijenti dobijaju obaveštenje.
export async function notifyNewRelease({ noteId, projectId, title }) {
  if (!projectId) return { created: false }
  const rule = effectiveRule(projectId, 'new_release')
  if (!rule?.enabled) return { created: false }
  const projectName = db.prepare('SELECT COALESCE(display_name, epic_key) AS n FROM projects WHERE id = ?').get(projectId)?.n || ''
  return createAlert({
    rule, projectId, type: 'new_release', severity: 'info',
    title: `Nova objava: ${title || 'Release notes'}`,
    body: `Objavljene su nove release notes za projekat ${projectName}.`,
    dedupKey: `new_release:${noteId}`,
  })
}
