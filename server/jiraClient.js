import crypto from 'crypto'
import axios from 'axios'

const ALGO = 'aes-256-cbc'

export function encryptToken(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decryptToken(stored) {
  const [ivHex, encHex] = stored.split(':')
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()])
  return decrypted.toString('utf8')
}

export function makeJiraAuth(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
}

function jiraClient(jiraUrl, auth) {
  const baseUrl = jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return axios.create({
    baseURL: `https://${baseUrl}/rest/api/3`,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
}

export async function jiraPost(jiraUrl, path, body, auth) {
  try {
    const res = await jiraClient(jiraUrl, auth).post(path, body)
    return res.data
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message
    throw new Error(`Jira API error ${err.response?.status ?? ''}: ${msg}`)
  }
}

export async function jiraGet(jiraUrl, path, auth) {
  try {
    const res = await jiraClient(jiraUrl, auth).get(path)
    return res.data
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message
    throw new Error(`Jira API error ${err.response?.status ?? ''}: ${msg}`)
  }
}

export const TASK_FIELDS = [
  'summary', 'status', 'timespent', 'timeoriginalestimate',
  'subtasks', 'components', 'issuetype', 'parent', 'issuelinks', 'assignee',
]

// Cache custom field keys per Jira instance
const billableFieldCache = {}
const moduleFieldCache = {}
const hoursToBillFieldCache = {}

// "Hours to be billed" number field — when set on a billable task, that value
// (not logged time) is what gets billed.
export async function detectHoursToBillField(jiraUrl, auth) {
  if (hoursToBillFieldCache[jiraUrl] !== undefined) return hoursToBillFieldCache[jiraUrl]
  try {
    const fields = await jiraGet(jiraUrl, '/field', auth)
    const found = (fields || []).find(f => f.name?.toLowerCase().includes('hours to be'))
    hoursToBillFieldCache[jiraUrl] = found?.key || null
    return hoursToBillFieldCache[jiraUrl]
  } catch {
    hoursToBillFieldCache[jiraUrl] = null
    return null
  }
}

export async function detectBillableField(jiraUrl, auth) {
  if (billableFieldCache[jiraUrl] !== undefined) return billableFieldCache[jiraUrl]
  try {
    const fields = await jiraGet(jiraUrl, '/field', auth)
    const found = (fields || []).find(f => f.name?.toLowerCase().includes('billable'))
    billableFieldCache[jiraUrl] = found?.key || null
    return billableFieldCache[jiraUrl]
  } catch {
    billableFieldCache[jiraUrl] = null
    return null
  }
}

export async function detectModuleField(jiraUrl, auth) {
  if (moduleFieldCache[jiraUrl] !== undefined) return moduleFieldCache[jiraUrl]
  try {
    const fields = await jiraGet(jiraUrl, '/field', auth)
    const found = (fields || []).find(f => f.name?.toLowerCase() === 'module' || f.name?.toLowerCase() === 'modules')
    moduleFieldCache[jiraUrl] = found?.key || null
    return moduleFieldCache[jiraUrl]
  } catch {
    moduleFieldCache[jiraUrl] = null
    return null
  }
}

export function parseBillableValue(raw) {
  if (raw === null || raw === undefined) return false
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') return ['yes', 'true', '1', 'da'].includes(raw.toLowerCase())
  if (typeof raw === 'object' && raw.value) return ['yes', 'true', '1', 'da'].includes(String(raw.value).toLowerCase())
  return false
}

export async function fetchEpicTasks(jiraUrl, epicKey, auth) {
  return fetchByJql(jiraUrl, `parent = ${epicKey} ORDER BY created ASC`, auth)
}

export async function fetchByJql(jiraUrl, jql, auth, fields = TASK_FIELDS) {
  const seen = new Set()
  const results = []
  let token = null
  let pages = 0
  do {
    const body = { jql, fields, maxResults: 100, ...(token ? { nextPageToken: token } : {}) }
    const data = await jiraPost(jiraUrl, '/search/jql', body, auth)
    const issues = data.issues || []
    for (const issue of issues) {
      if (!seen.has(issue.key)) {
        seen.add(issue.key)
        results.push(issue)
      }
    }
    token = data.isLast ? null : (data.nextPageToken || null)
    pages++
    // Safety: stop if token doesn't change (loop) or exceeded 100 pages
    if (pages >= 100) break
  } while (token)
  return results
}

// ── Worklogs (real authors + dates) ──────────────────────────────────────────
// The search API inlines the first 20 worklogs per issue; issues with more get
// a dedicated paginated /worklog call. Entries are slimmed to what the client
// needs so the payload stays small.

const slimWorklog = w => ({
  author: w.author?.displayName || null,
  started: String(w.started || '').slice(0, 10),
  seconds: w.timeSpentSeconds || 0,
})

export async function fetchAllWorklogs(jiraUrl, key, auth) {
  const out = []
  let startAt = 0
  for (let page = 0; page < 50; page++) {
    const data = await jiraGet(jiraUrl, `/issue/${key}/worklog?startAt=${startAt}&maxResults=100`, auth)
    const logs = data.worklogs || []
    out.push(...logs.map(slimWorklog))
    startAt += logs.length
    if (startAt >= (data.total || 0) || logs.length === 0) break
  }
  return out
}

// Mutates each issue: fields.worklogEntries = [{author, started, seconds}],
// raw fields.worklog removed. Issues with >20 logs are fetched concurrently.
export async function attachWorklogs(jiraUrl, issues, auth, concurrency = 8) {
  const needFull = []
  for (const issue of issues) {
    const wl = issue.fields?.worklog
    if (!wl) { issue.fields.worklogEntries = []; continue }
    if ((wl.total || 0) > (wl.worklogs || []).length) {
      needFull.push(issue)
    } else {
      issue.fields.worklogEntries = (wl.worklogs || []).map(slimWorklog)
    }
    delete issue.fields.worklog
  }
  for (let i = 0; i < needFull.length; i += concurrency) {
    const batch = needFull.slice(i, i + concurrency)
    await Promise.all(batch.map(async issue => {
      try { issue.fields.worklogEntries = await fetchAllWorklogs(jiraUrl, issue.key, auth) }
      catch { issue.fields.worklogEntries = [] }
    }))
  }
}

export async function fetchSubtasks(jiraUrl, subKeys, auth, fields = TASK_FIELDS) {
  const seen = new Set()
  const subs = []
  // Deduplicate keys before fetching
  const uniqueKeys = [...new Set(subKeys)]
  for (let i = 0; i < uniqueKeys.length; i += 50) {
    const batch = uniqueKeys.slice(i, i + 50)
    const jql = `issuekey in (${batch.join(',')})`
    const data = await jiraPost(jiraUrl, '/search/jql', { jql, fields, maxResults: 50 }, auth)
    for (const issue of (data.issues || [])) {
      if (!seen.has(issue.key)) {
        seen.add(issue.key)
        subs.push(issue)
      }
    }
  }
  return subs
}
