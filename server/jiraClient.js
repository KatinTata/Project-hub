import crypto from 'crypto'
import axios from 'axios'
import { dayInBelgrade } from './dates.js'

// ── Enkripcija tajni (P1-15): AES-256-GCM sa autentikacijom ─────────────────
// Novi format: 'v2:iv:tag:ciphertext' (hex). GCM auth tag garantuje da
// manipulisan ciphertext pri dekripciji BACA grešku umesto da vrati smeće.
// Stari CBC format ('iv:ciphertext', bez prefiksa) se i dalje dešifruje radi
// postojećih zapisa — novi upisi su uvek GCM. ENCRYPTION_KEY ostaje 64 hex.

const GCM_PREFIX = 'v2'

export function encryptToken(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const iv = crypto.randomBytes(12) // preporučena dužina IV za GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${GCM_PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptGcm(stored) {
  const [, ivHex, tagHex, encHex] = stored.split(':')
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

function decryptLegacyCbc(stored) {
  const [ivHex, encHex] = stored.split(':')
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
}

export function decryptToken(stored) {
  return String(stored).startsWith(`${GCM_PREFIX}:`) ? decryptGcm(stored) : decryptLegacyCbc(stored)
}

// Da li je vrednost u starom CBC formatu (za lazy re-enkripciju pri čitanju).
export function isLegacyEncrypted(stored) {
  return !!stored && !String(stored).startsWith(`${GCM_PREFIX}:`)
}

export function makeJiraAuth(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
}

function jiraClient(jiraUrl, auth) {
  const baseUrl = jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return axios.create({
    baseURL: `https://${baseUrl}/rest/api/3`,
    timeout: JIRA_TIMEOUT_MS,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
}

// ── Transport: timeout + retry + globalni limit paralelnosti (P1-14) ─────────
// Bez timeouta je spor Jira endpoint držao zahtev otvorenim neograničeno; bez
// limita je veliki epic (stotine subtaskova sa worklogovima) otvarao onoliko
// konekcija koliko ima taskova.
const JIRA_TIMEOUT_MS = 20000
const JIRA_MAX_RETRIES = 3
const JIRA_MAX_CONCURRENT = 8

let activeRequests = 0
const waitQueue = []
async function withSlot(fn) {
  if (activeRequests >= JIRA_MAX_CONCURRENT) await new Promise(r => waitQueue.push(r))
  activeRequests++
  try {
    return await fn()
  } finally {
    activeRequests--
    const next = waitQueue.shift()
    if (next) next()
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Retry samo za prolazne greške: mrežne/timeout (bez response-a), 429 i 5xx.
// Ostale 4xx su determinističke — retry bi samo ponovio istu grešku.
const isRetryable = err => {
  const st = err.response?.status
  if (st === 429) return true
  if (st >= 500 && st <= 599) return true
  return !err.response
}

// Svi pozivi kroz jiraGet/jiraPost su čitanja (search, issue, field, worklog),
// pa je retry bezbedan i za POST (/search/jql je pretraga, ne mutacija).
async function jiraRequest(jiraUrl, method, path, body, auth) {
  let lastErr
  for (let attempt = 0; attempt < JIRA_MAX_RETRIES; attempt++) {
    try {
      return await withSlot(async () => {
        const client = jiraClient(jiraUrl, auth)
        const res = method === 'post' ? await client.post(path, body) : await client.get(path)
        return res.data
      })
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === JIRA_MAX_RETRIES - 1) break
      await sleep(500 * 2 ** attempt) // 500ms pa 1s
    }
  }
  const msg = lastErr.response?.data ? JSON.stringify(lastErr.response.data) : lastErr.message
  throw new Error(`Jira API error ${lastErr.response?.status ?? ''}: ${msg}`)
}

export function jiraPost(jiraUrl, path, body, auth) {
  return jiraRequest(jiraUrl, 'post', path, body, auth)
}

export function jiraGet(jiraUrl, path, auth) {
  return jiraRequest(jiraUrl, 'get', path, null, auth)
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

// Accepted "billable" option values. BILLED counts as billable too — it means
// the work was billable and has already been invoiced; without it, tasks would
// vanish from billable totals the moment they get invoiced. Values are trimmed
// because at least one Jira option is stored with a trailing space ("BILLED ").
const BILLABLE_VALUES = new Set(['yes', 'true', '1', 'da', 'billed'])

export function parseBillableValue(raw) {
  if (raw === null || raw === undefined) return false
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') return BILLABLE_VALUES.has(raw.trim().toLowerCase())
  if (typeof raw === 'object' && raw.value) return BILLABLE_VALUES.has(String(raw.value).trim().toLowerCase())
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

// `started` stiže sa ofsetom zone autora (npr. "...T23:30:00.000+0500") —
// sečenje stringa bi uzelo dan u TOJ zoni. Normalizujemo na Europe/Belgrade
// da svi worklogovi padnu u isti kalendarski dan kao u našim izveštajima (P1-8.7).
const slimWorklog = w => ({
  author: w.author?.displayName || null,
  started: dayInBelgrade(w.started) || String(w.started || '').slice(0, 10),
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
