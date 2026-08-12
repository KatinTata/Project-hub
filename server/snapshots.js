// Serverski dnevni snapshot svih aktivnih projekata (P2-E3).
// Do sada je snapshot okidao KLIJENT pri otvaranju projekta — projekat koji
// niko ne otvori tog dana nema tačku u trendu. Ovaj posao popunjava rupe:
// INSERT ... DO NOTHING znači da klijentski (svežiji) snapshot istog dana
// nikad nije pregažen, a dan bez otvaranja dobija svoju tačku.
//
// Brojevi su IDENTIČNI klijentskim: koristi iste module (processEpicData,
// buildStackMatrix, billableSecondsOf) — to su čisti JS moduli bez browser
// zavisnosti, pa ih Node uvozi direktno.

import db from './db.js'
import {
  decryptToken, makeJiraAuth, jiraGet, fetchByJql, fetchSubtasks,
  TASK_FIELDS, detectBillableField, detectHoursToBillField, parseBillableValue,
} from './jiraClient.js'
import { dayInBelgrade } from './dates.js'
import { processEpicData, billableSecondsOf } from '../client/src/utils.js'
import { buildStackMatrix } from '../client/src/utils/stacks.js'
import { setCalcConfig } from '../client/src/utils/calcConfig.js'

function jiraFor(userId) {
  const user = db.prepare('SELECT jira_url, jira_email, jira_token FROM users WHERE id = ?').get(userId)
  if (user?.jira_url && user?.jira_email && user?.jira_token) {
    return { jiraUrl: user.jira_url, auth: makeJiraAuth(user.jira_email, decryptToken(user.jira_token)) }
  }
  const sa = db.prepare("SELECT jira_url, jira_email, jira_token FROM users WHERE role = 'super_admin' AND jira_url IS NOT NULL AND jira_token IS NOT NULL LIMIT 1").get()
  if (!sa) return null
  return { jiraUrl: sa.jira_url, auth: makeJiraAuth(sa.jira_email, decryptToken(sa.jira_token)) }
}

function loadCalcConfigFromSettings() {
  try {
    const rows = db.prepare("SELECT key, value FROM app_settings WHERE key IN ('overrunThresholdPct', 'capacityTightPct', 'overrunTailPct')").all()
    const cfg = {}
    for (const r of rows) cfg[r.key] = r.value
    setCalcConfig(cfg)
  } catch { /* defaulti su isti kao klijentski */ }
}

async function fetchProjectTasks(jira, project) {
  const filterType = project.filter_type || 'epic'
  let jql
  if (filterType === 'epic') {
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(project.epic_key || '')) return null
    jql = `parent = ${project.epic_key} ORDER BY created ASC`
  } else {
    jql = project.filter_jql
  }
  if (!jql) return null

  const [billableKey, hoursToBillKey] = await Promise.all([
    detectBillableField(jira.jiraUrl, jira.auth),
    detectHoursToBillField(jira.jiraUrl, jira.auth),
  ])
  const fields = [...TASK_FIELDS, ...(billableKey ? [billableKey] : []), ...(hoursToBillKey ? [hoursToBillKey] : [])]

  const normalize = issues => {
    for (const issue of issues) {
      if (billableKey) issue.fields.billable = parseBillableValue(issue.fields[billableKey])
      if (hoursToBillKey) {
        const h = Number(issue.fields[hoursToBillKey])
        issue.fields.hoursToBill = Number.isFinite(h) && h > 0 ? h : 0
      }
    }
    return issues
  }

  const parents = normalize(await fetchByJql(jira.jiraUrl, jql, jira.auth, fields))
  const subKeys = parents.flatMap(p => (p.fields?.subtasks || []).map(s => s.key))
  const subtasks = subKeys.length ? normalize(await fetchSubtasks(jira.jiraUrl, subKeys, jira.auth, fields)) : []

  // Sati logovani direktno na epiku — isti best-effort kao POST /api/jira/tasks
  let epicSelf = null
  if (filterType === 'epic' && project.epic_key) {
    try {
      const epic = await jiraGet(jira.jiraUrl, `/issue/${encodeURIComponent(project.epic_key)}?fields=summary,status,timespent,timeoriginalestimate,assignee`, jira.auth)
      if ((epic.fields?.timespent || 0) > 0) {
        epicSelf = {
          key: epic.key,
          summary: epic.fields?.summary || '',
          status: epic.fields?.status?.name || '',
          timespent: epic.fields?.timespent || 0,
          timeoriginalestimate: epic.fields?.timeoriginalestimate || 0,
          assignee: epic.fields?.assignee?.displayName || null,
          worklogEntries: [],
        }
      }
    } catch { /* best-effort */ }
  }

  return { parents, subtasks, epicSelf }
}

export async function runDailySnapshots() {
  loadCalcConfigFromSettings()
  const day = dayInBelgrade(new Date())
  const projects = db.prepare(`
    SELECT id, user_id, epic_key, filter_type, filter_jql
    FROM projects WHERE archived IS NULL OR archived = 0
  `).all()

  const insert = db.prepare(
    'INSERT INTO project_snapshots (project_id, day, payload) VALUES (?, ?, ?) ON CONFLICT(project_id, day) DO NOTHING'
  )
  const hasToday = db.prepare('SELECT 1 FROM project_snapshots WHERE project_id = ? AND day = ?')

  let ok = 0, skipped = 0, failed = 0
  for (const project of projects) {
    if (hasToday.get(project.id, day)) { skipped++; continue }
    try {
      const jira = jiraFor(project.user_id)
      if (!jira) { skipped++; continue }
      const fetched = await fetchProjectTasks(jira, project)
      if (!fetched) { skipped++; continue }

      const r = processEpicData(fetched.parents, fetched.subtasks, fetched.epicSelf)
      const sm = buildStackMatrix(r.tasks, [])
      const stacks = {}
      for (const s of sm.stacks) stacks[s] = { plan: sm.colTotals[s].plan, spent: sm.colTotals[s].spent, remaining: sm.colTotals[s].remaining }
      const billableSpent = r.tasks.reduce((acc, t) => acc + billableSecondsOf(t), 0)

      insert.run(project.id, day, JSON.stringify({
        total: r.total, done: r.done, inprog: r.inprog, testing: r.testing, todo: r.todo, unknown: r.unknown || 0,
        totalEst: r.totalEst, totalSpent: r.totalSpent, remainingEst: sm.grand.remaining, billableSpent, stacks,
      }))
      ok++
    } catch (err) {
      failed++
      console.error(`[snapshot] projekat ${project.id}: ${err.message}`)
    }
  }
  return { day, ok, skipped, failed, total: projects.length }
}
