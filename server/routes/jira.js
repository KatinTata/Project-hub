import { Router } from 'express'
import db from '../db.js'
import { decryptToken, makeJiraAuth, jiraGet, jiraPost, fetchByJql, fetchSubtasks, attachWorklogs, TASK_FIELDS, detectBillableField, parseBillableValue, detectModuleField, detectHoursToBillField } from '../jiraClient.js'
import { getRole as getUserRole, isAdminRole, roleFrom } from '../rbac.js'

const router = Router()

function getUserJira(userId) {
  const user = db.prepare('SELECT jira_url, jira_email, jira_token FROM users WHERE id = ?').get(userId)
  if (!user?.jira_url || !user?.jira_email || !user?.jira_token) return null
  const token = decryptToken(user.jira_token)
  const auth = makeJiraAuth(user.jira_email, token)
  return { jiraUrl: user.jira_url, auth }
}

// Klijent (rola 'user') nema svoje Jira kredencijale — fallback lanac bi ga
// odveo na super_admin kredencijale, pa interne rute moraju biti zatvorene.
function requireInternal(req, res, next) {
  if (!isAdminRole(roleFrom(req))) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/

function isValidJiraKey(key) {
  return typeof key === 'string' && JIRA_KEY_RE.test(key)
}

function getSuperAdminJira() {
  const sa = db.prepare("SELECT jira_url, jira_email, jira_token FROM users WHERE role = 'super_admin' AND jira_url IS NOT NULL AND jira_token IS NOT NULL LIMIT 1").get()
  if (!sa) return null
  const token = decryptToken(sa.jira_token)
  const auth = makeJiraAuth(sa.jira_email, token)
  return { jiraUrl: sa.jira_url, auth }
}

function getAnyJiraForClient(clientUserId) {
  const row = db.prepare(`
    SELECT p.user_id as ownerId FROM project_clients pc
    JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ? LIMIT 1
  `).get(clientUserId)
  if (!row) return null
  return getUserJira(row.ownerId) || getSuperAdminJira()
}

function getClientOwnerJira(clientUserId, epicKey) {
  const assignment = db.prepare(`
    SELECT p.user_id as ownerId FROM project_clients pc
    JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ? AND p.epic_key = ?
  `).get(clientUserId, epicKey)
  if (!assignment) return null
  return getUserJira(assignment.ownerId) || getSuperAdminJira()
}

function getClientOwnerJiraByProjectId(clientUserId, projectId) {
  const assignment = db.prepare(`
    SELECT p.user_id as ownerId FROM project_clients pc
    JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ? AND p.id = ?
  `).get(clientUserId, projectId)
  if (!assignment) return null
  return getUserJira(assignment.ownerId) || getSuperAdminJira()
}

router.get('/epic/:epicKey', async (req, res) => {
  try {
    if (!isValidJiraKey(req.params.epicKey)) return res.status(400).json({ error: 'Nevalidan Jira ključ' })
    const role = getUserRole(req.userId)
    const jira = role === 'user'
      ? getClientOwnerJira(req.userId, req.params.epicKey)
      : getUserJira(req.userId) || getSuperAdminJira()
    if (!jira) return res.status(400).json({ error: 'Jira nije konfigurisan' })
    const data = await jiraGet(jira.jiraUrl, `/issue/${encodeURIComponent(req.params.epicKey)}`, jira.auth)
    res.json(data)
  } catch (err) {
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

// POST /api/jira/tasks — supports epic, jql, combined filter types
router.post('/tasks', async (req, res) => {
  try {
    let { filterType = 'epic', epicKey, jql, projectId } = req.body
    const role = getUserRole(req.userId)

    let jira
    if (role === 'user') {
      // Klijent: filter dolazi ISKLJUČIVO iz baze za projekat na koji je dodeljen,
      // nikad iz tela zahteva (sprečava proizvoljan JQL preko tuđih kredencijala).
      const project = projectId
        ? db.prepare(`
            SELECT p.* FROM projects p
            JOIN project_clients pc ON pc.project_id = p.id
            WHERE pc.client_user_id = ? AND p.id = ?
          `).get(req.userId, projectId)
        : db.prepare(`
            SELECT p.* FROM projects p
            JOIN project_clients pc ON pc.project_id = p.id
            WHERE pc.client_user_id = ? AND p.epic_key = ?
          `).get(req.userId, epicKey)
      if (!project) return res.status(403).json({ error: 'Forbidden' })

      filterType = project.filter_type || 'epic'
      epicKey = project.epic_key
      jql = project.filter_jql

      jira = getClientOwnerJiraByProjectId(req.userId, project.id)
    } else {
      jira = getUserJira(req.userId) || getSuperAdminJira()
    }
    if (!jira) return res.status(400).json({ error: 'Jira nije konfigurisan' })

    let resolvedJql
    if (filterType === 'epic') {
      if (!isValidJiraKey(epicKey)) return res.status(400).json({ error: 'Nevalidan Jira ključ' })
      resolvedJql = `parent = ${epicKey} ORDER BY created ASC`
    } else {
      resolvedJql = jql
    }

    // Detect custom fields for this Jira instance
    const [billableKey, moduleKey, hoursToBillKey] = await Promise.all([
      detectBillableField(jira.jiraUrl, jira.auth),
      detectModuleField(jira.jiraUrl, jira.auth),
      detectHoursToBillField(jira.jiraUrl, jira.auth),
    ])

    const extraFields = ['worklog'] // real authors + dates for hour attribution
    if (billableKey) extraFields.push(billableKey)
    if (moduleKey) extraFields.push(moduleKey)
    if (hoursToBillKey) extraFields.push(hoursToBillKey)
    const fields = [...TASK_FIELDS, ...extraFields]

    const parents = await fetchByJql(jira.jiraUrl, resolvedJql, jira.auth, fields)

    // Normalize billable and module values on each issue
    for (const issue of parents) {
      if (billableKey) {
        issue.fields.billable = parseBillableValue(issue.fields[billableKey])
      }
      if (moduleKey) {
        const raw = issue.fields[moduleKey]
        issue.fields.modules = Array.isArray(raw) ? raw.map(m => m.value || m.name || String(m)).filter(Boolean) : []
      }
      if (hoursToBillKey) {
        const h = Number(issue.fields[hoursToBillKey])
        issue.fields.hoursToBill = Number.isFinite(h) && h > 0 ? h : 0
      }
    }

    const subKeys = []
    for (const p of parents) {
      if (p.fields?.subtasks?.length) {
        subKeys.push(...p.fields.subtasks.map(s => s.key))
      }
    }

    const subtasks = subKeys.length > 0
      ? await fetchSubtasks(jira.jiraUrl, subKeys, jira.auth, fields)
      : []

    for (const issue of subtasks) {
      if (billableKey) {
        issue.fields.billable = parseBillableValue(issue.fields[billableKey])
      }
      if (moduleKey) {
        const raw = issue.fields[moduleKey]
        issue.fields.modules = Array.isArray(raw) ? raw.map(m => m.value || m.name || String(m)).filter(Boolean) : []
      }
      if (hoursToBillKey) {
        const h = Number(issue.fields[hoursToBillKey])
        issue.fields.hoursToBill = Number.isFinite(h) && h > 0 ? h : 0
      }
    }

    await attachWorklogs(jira.jiraUrl, [...parents, ...subtasks], jira.auth)

    // Hours logged directly on the epic issue itself (outside `parent = EPIC`)
    let epicSelf = null
    if (filterType === 'epic' && epicKey) {
      try {
        const epic = await jiraGet(jira.jiraUrl, `/issue/${encodeURIComponent(epicKey)}?fields=summary,status,timespent,timeoriginalestimate,assignee,worklog`, jira.auth)
        if ((epic.fields?.timespent || 0) > 0) {
          await attachWorklogs(jira.jiraUrl, [epic], jira.auth)
          epicSelf = {
            key: epic.key,
            summary: epic.fields?.summary || '',
            status: epic.fields?.status?.name || '',
            timespent: epic.fields?.timespent || 0,
            timeoriginalestimate: epic.fields?.timeoriginalestimate || 0,
            assignee: epic.fields?.assignee?.displayName || null,
            worklogEntries: epic.fields?.worklogEntries || [],
          }
        }
      } catch { /* epic fetch is best-effort */ }
    }

    res.json({ parents, subtasks, epicSelf, hasBillableField: !!billableKey, hasModuleField: !!moduleKey })
  } catch (err) {
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

// POST /api/jira/test-jql — test a JQL query and return count + preview
router.post('/test-jql', requireInternal, async (req, res) => {
  try {
    const { jql } = req.body
    if (!jql?.trim()) return res.status(400).json({ error: 'JQL je obavezan' })

    const jira = getUserJira(req.userId) || getSuperAdminJira()
    if (!jira) return res.status(400).json({ error: 'Jira nije konfigurisan' })

    let data
    try {
      data = await jiraPost(jira.jiraUrl, '/search/jql', {
        jql,
        fields: ['summary', 'status'],
        maxResults: 100,
      }, jira.auth)
    } catch (jiraErr) {
      // Extract structured Jira error messages if present, return 422 (not 500)
      const raw = jiraErr.message || ''
      const jsonMatch = raw.match(/\{.*\}$/s)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          const msg = (parsed.errorMessages || [])[0] || raw
          return res.status(422).json({ jiraError: true, error: msg })
        } catch {}
      }
      return res.status(422).json({ jiraError: true, error: raw })
    }

    const allIssues = data.issues || []
    const preview = allIssues.slice(0, 5).map(i => ({
      key: i.key,
      summary: i.fields?.summary || '',
      status: i.fields?.status?.name || '',
    }))
    const count = data.total ?? (data.isLast === false ? '100+' : allIssues.length)

    res.json({ count, preview })
  } catch (err) {
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

// GET /api/jira/jql-fields — returns list of JQL field names for autocomplete
router.get('/jql-fields', requireInternal, async (req, res) => {
  try {
    const jira = getUserJira(req.userId) || getSuperAdminJira()
    if (!jira) return res.json([])
    try {
      const data = await jiraGet(jira.jiraUrl, '/jql/autocompletedata', jira.auth)
      const fields = (data.visibleFieldNames || []).map(f => ({ value: f.value, displayName: f.displayName || f.value }))
      return res.json(fields)
    } catch {
      // Endpoint not supported — return empty list, editor still works with local keywords
      return res.json([])
    }
  } catch (err) {
    res.json([])
  }
})

// GET /api/jira/jql-suggestions?fieldName=X&fieldValue=Y — returns value suggestions
router.get('/jql-suggestions', requireInternal, async (req, res) => {
  try {
    const { fieldName, fieldValue = '' } = req.query
    if (!fieldName) return res.json([])
    const jira = getUserJira(req.userId) || getSuperAdminJira()
    if (!jira) return res.json([])
    try {
      const data = await jiraGet(
        jira.jiraUrl,
        `/jql/autocompletedata/suggestions?fieldName=${encodeURIComponent(fieldName)}&fieldValue=${encodeURIComponent(fieldValue)}`,
        jira.auth
      )
      res.json(data.results || [])
    } catch {
      res.json([])
    }
  } catch (err) {
    res.json([])
  }
})

// GET /api/jira/task-info/:key — fetch task summary for chat linking (label only, no Jira write)
router.get('/task-info/:key', async (req, res) => {
  try {
    if (!isValidJiraKey(req.params.key)) return res.status(400).json({ error: 'Nevalidan Jira ključ' })
    const role = getUserRole(req.userId)
    if (role === 'user') {
      // Klijent sme da vidi naslov SAMO za taskove već referencirane u porukama
      // projekata na koje je dodeljen — ne za proizvoljan ključ.
      const allowed = db.prepare(`
        SELECT 1 FROM messages m
        JOIN project_clients pc ON pc.project_id = m.project_id
        WHERE pc.client_user_id = ? AND m.task_key = ?
        LIMIT 1
      `).get(req.userId, req.params.key)
      if (!allowed) return res.status(403).json({ error: 'Forbidden' })
    }
    const jira = role === 'user'
      ? getAnyJiraForClient(req.userId)
      : getUserJira(req.userId) || getSuperAdminJira()
    if (!jira) return res.status(400).json({ error: 'Jira nije konfigurisan' })

    const data = await jiraGet(jira.jiraUrl, `/issue/${encodeURIComponent(req.params.key)}?fields=summary`, jira.auth)
    res.json({ key: req.params.key, summary: data.fields?.summary || '' })
  } catch (err) {
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

router.get('/changelog/:key', requireInternal, async (req, res) => {
  try {
    if (!isValidJiraKey(req.params.key)) return res.status(400).json({ error: 'Nevalidan Jira ključ' })
    const jira = getUserJira(req.userId)
    if (!jira) return res.status(400).json({ error: 'Jira nije konfigurisan' })

    const data = await jiraGet(jira.jiraUrl, `/issue/${encodeURIComponent(req.params.key)}?fields=reporter,assignee&expand=changelog`, jira.auth)

    // Jira returns histories oldest-first; reverse to get newest first
    const histories = [...(data.changelog?.histories || [])].reverse()
    const result = histories.map(h => ({
      author: h.author?.displayName || h.author?.emailAddress || null,
      created: h.created,
      items: h.items.map(i => ({ field: i.field, from: i.fromString, to: i.toString })),
    }))

    res.json({
      reporter: data.fields?.reporter?.displayName || null,
      assignee: data.fields?.assignee?.displayName || null,
      changelog: result,
    })
  } catch (err) {
    { req.log?.error({ err }); res.status(500).json({ error: 'Greška servera' }) }
  }
})

export default router
