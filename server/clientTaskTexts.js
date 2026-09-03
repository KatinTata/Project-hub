// Klijentski tekstovi taskova: prevod naslova + generisan opis u jednoj
// rečenici, na jeziku projekta (projects.client_lang). Generiše se pri
// učitavanju taskova (fire-and-forget) SAMO za nove taskove ili one kojima se
// naslov promenio — hash naslova je ključ keša, pa je trošak jedan AI poziv
// po verziji taska, ne po otvaranju stranice. Ručno izmenjeni redovi
// (edited_by != NULL) se nikad ne regenerišu automatski.

import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import db from './db.js'
import { decryptToken, fetchSubtasks } from './jiraClient.js'
import { logger } from './logger.js'

const MODEL = 'claude-haiku-4-5-20251001' // brz i jeftin — dovoljan za prevod + jednu rečenicu
const BATCH_SIZE = 15          // taskova po AI pozivu
const DESC_FETCH_FIELDS = ['summary', 'description']
const MAX_BODY_CHARS = 1500    // telo taska se seče pre slanja modelu

const LANG_NAMES = { en: 'English', de: 'German', bg: 'Bulgarian' }

export const hashSource = summary =>
  crypto.createHash('sha256').update(String(summary || '')).digest('hex').slice(0, 16)

export function getTextsMap(projectId, lang) {
  const rows = db.prepare(
    'SELECT task_key, title, one_liner, edited_by FROM task_client_texts WHERE project_id = ? AND lang = ?'
  ).all(projectId, lang)
  const map = {}
  for (const r of rows) map[r.task_key] = { title: r.title, one_liner: r.one_liner, edited: !!r.edited_by }
  return map
}

export function upsertManual(projectId, taskKey, lang, { title, one_liner }, userId) {
  db.prepare(`
    INSERT INTO task_client_texts (project_id, task_key, lang, title, one_liner, edited_by, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (project_id, task_key, lang) DO UPDATE SET
      title = excluded.title, one_liner = excluded.one_liner,
      edited_by = excluded.edited_by, generated_at = CURRENT_TIMESTAMP
  `).run(projectId, taskKey, lang, title?.trim() || null, one_liner?.trim() || null, userId)
}

// Isti redosled rezolucije ključa kao release notes AI (vlasnik → super_admin → env)
function resolveAnthropicKey(ownerUserId) {
  const own = db.prepare('SELECT anthropic_key FROM users WHERE id = ?').get(ownerUserId)
  if (own?.anthropic_key) return decryptToken(own.anthropic_key)
  const sa = db.prepare("SELECT anthropic_key FROM users WHERE role = 'super_admin' AND anthropic_key IS NOT NULL LIMIT 1").get()
  if (sa?.anthropic_key) return decryptToken(sa.anthropic_key)
  return process.env.ANTHROPIC_API_KEY || null
}

// Jira API v3 vraća description kao ADF (JSON dokument) — izvuci čist tekst.
export function adfToText(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(adfToText).join('')
  let out = ''
  if (node.type === 'text') out += node.text || ''
  if (node.content) out += adfToText(node.content)
  if (['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(node.type)) out += '\n'
  return out
}

function pendingTasks(projectId, lang, tasks) {
  const existing = db.prepare(
    'SELECT task_key, source_hash, edited_by FROM task_client_texts WHERE project_id = ? AND lang = ?'
  ).all(projectId, lang)
  const byKey = Object.fromEntries(existing.map(r => [r.task_key, r]))
  const seen = new Set()
  const out = []
  for (const t of tasks) {
    if (!t?.key || seen.has(t.key)) continue
    seen.add(t.key)
    const row = byKey[t.key]
    if (row?.edited_by) continue // admin je ručno ispravio — ne diramo
    if (row && row.source_hash === hashSource(t.summary)) continue
    out.push({ key: t.key, summary: String(t.summary || '') })
  }
  return out
}

function buildPrompt(lang, items) {
  const language = LANG_NAMES[lang] || lang
  return `You prepare Jira task texts for a client-facing portal. For EACH task below return:
- "title": the task title translated to ${language} (keep it short, faithful, no embellishment; if already in ${language}, keep as is),
- "one_liner": ONE sentence in ${language} describing what the task is about, based on the body. Strictly functional; NEVER include people's names, hour estimates, prices, internal notes or discussion details. If the body is empty or uninformative, return null.

Return ONLY a JSON array, no markdown fences, exactly one object per task:
[{"key": "...", "title": "...", "one_liner": "..." | null}, ...]

Tasks:
${JSON.stringify(items, null, 1)}`
}

function parseJsonArray(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error('AI odgovor nije JSON niz')
  return JSON.parse(cleaned.slice(start, end + 1))
}

// Jedan projekat generiše najviše jednom istovremeno (fetch može stići
// paralelno sa više kartica/korisnika).
const inFlight = new Set()

// Fire-and-forget: poziva se iz rute POSLE odgovora klijentu; greške se loguju.
export function queueGeneration({ project, jira, tasks }) {
  const lang = project?.client_lang
  if (!lang || !project?.id || !jira) return
  const pending = pendingTasks(project.id, lang, tasks)
  if (!pending.length) return
  if (inFlight.has(project.id)) return
  inFlight.add(project.id)

  generate({ project, jira, lang, pending })
    .catch(err => logger.error({ err, projectId: project.id }, '[client-texts] generisanje palo'))
    .finally(() => inFlight.delete(project.id))
}

async function generate({ project, jira, lang, pending }) {
  const apiKey = resolveAnthropicKey(project.user_id)
  if (!apiKey) { logger.warn('[client-texts] Anthropic ključ nije podešen — preskačem'); return }
  const anthropic = new Anthropic({ apiKey, maxRetries: 3 })

  // Tela taskova se vuku posebno (description nije u standardnim poljima da ne
  // duva redovne fetch-eve) — batch po ključevima, samo za taskove na čekanju.
  const bodies = {}
  try {
    const issues = await fetchSubtasks(jira.jiraUrl, pending.map(p => p.key), jira.auth, DESC_FETCH_FIELDS)
    for (const it of issues) bodies[it.key] = adfToText(it.fields?.description).trim().slice(0, MAX_BODY_CHARS)
  } catch (err) {
    logger.warn({ err }, '[client-texts] dovlačenje opisa palo — generišem samo iz naslova')
  }

  const upsert = db.prepare(`
    INSERT INTO task_client_texts (project_id, task_key, lang, title, one_liner, source_hash, edited_by, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT (project_id, task_key, lang) DO UPDATE SET
      title = excluded.title, one_liner = excluded.one_liner,
      source_hash = excluded.source_hash, generated_at = CURRENT_TIMESTAMP
    WHERE task_client_texts.edited_by IS NULL
  `)

  let done = 0
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    const items = batch.map(p => ({ key: p.key, title: p.summary, body: bodies[p.key] || '' }))
    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: buildPrompt(lang, items) }],
      })
      const rows = parseJsonArray(msg.content?.[0]?.text)
      const byKey = Object.fromEntries(batch.map(p => [p.key, p]))
      for (const r of rows) {
        const src = byKey[r?.key]
        if (!src) continue
        const title = String(r.title || '').trim() || src.summary
        const oneLiner = r.one_liner ? String(r.one_liner).trim() : null
        upsert.run(project.id, src.key, lang, title, oneLiner, hashSource(src.summary))
        done++
      }
    } catch (err) {
      logger.error({ err, projectId: project.id, batch: i / BATCH_SIZE }, '[client-texts] AI batch pao')
    }
  }
  logger.info({ projectId: project.id, lang, generated: done, requested: pending.length }, '[client-texts] generisano')
}
