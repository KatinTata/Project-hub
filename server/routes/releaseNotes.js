import { Router } from 'express'
import { randomBytes } from 'crypto'
import db from '../db.js'
import { decryptToken, makeJiraAuth, jiraPost, detectBillableField, parseBillableValue } from '../jiraClient.js'
import { preparePublishedHtml, setPublishedSecurityHeaders } from '../publishedHtml.js'
import { sanitizePublishedHtml } from '../sanitize.js'
import { getRole, isAdminRole } from '../rbac.js'
import { logAudit } from '../audit.js'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, ShadingType,
} from 'docx'
import Anthropic from '@anthropic-ai/sdk'
import ExcelJS from 'exceljs'

const router = Router()

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUserJira(userId) {
  const user = db.prepare('SELECT jira_url, jira_email, jira_token FROM users WHERE id = ?').get(userId)
  if (!user?.jira_url || !user?.jira_email || !user?.jira_token) return null
  const token = decryptToken(user.jira_token)
  const auth = makeJiraAuth(user.jira_email, token)
  return { jiraUrl: user.jira_url, auth }
}

function getSuperAdminJira() {
  const sa = db.prepare("SELECT jira_url, jira_email, jira_token FROM users WHERE role = 'super_admin' AND jira_url IS NOT NULL AND jira_token IS NOT NULL LIMIT 1").get()
  if (!sa) return null
  const token = decryptToken(sa.jira_token)
  const auth = makeJiraAuth(sa.jira_email, token)
  return { jiraUrl: sa.jira_url, auth }
}

function getOwnerJiraForProject(userId, projectId) {
  const role = getRole(userId)
  if (isAdminRole(role)) return getUserJira(userId) || getSuperAdminJira()

  const row = db.prepare(`
    SELECT p.user_id as ownerId FROM project_clients pc
    JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ? AND p.id = ?
  `).get(userId, projectId)
  if (!row) return null
  return getUserJira(row.ownerId)
}

function getProject(userId, projectId) {
  const role = getRole(userId)
  if (isAdminRole(role)) {
    // Strictly per-user — every admin (incl. super_admin) uses only own projects
    return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
  }
  return db.prepare(`
    SELECT p.* FROM project_clients pc
    JOIN projects p ON p.id = pc.project_id
    WHERE pc.client_user_id = ? AND p.id = ?
  `).get(userId, projectId)
}

async function fetchTasksForProject(jira, project, customJql) {
  const billableKey = await detectBillableField(jira.jiraUrl, jira.auth)
  const fields = ['summary', 'status', 'issuetype', 'description', 'assignee', 'components', 'issuelinks']
  if (billableKey) fields.push(billableKey)
  let jql
  if (customJql?.trim()) {
    jql = customJql.trim()
  } else if (project?.filter_type === 'jql' && project.filter_jql) {
    jql = project.filter_jql
  } else if (project?.filter_type === 'combined' && project.filter_jql) {
    jql = project.filter_jql
  } else if (project) {
    jql = `parent = ${project.epic_key} ORDER BY created ASC`
  } else {
    throw new Error('Potreban je projekat ili JQL')
  }

  let results = []
  let token = null
  do {
    const body = { jql, fields, maxResults: 100, ...(token ? { nextPageToken: token } : {}) }
    const data = await jiraPost(jira.jiraUrl, '/search/jql', body, jira.auth)
    results.push(...(data.issues || []))
    token = data.isLast ? null : (data.nextPageToken || null)
  } while (token)

  // Release notes are per main task — drop Jira subtasks (e.g. "… – Back/Web/Testing").
  return results.filter(issue => !issue.fields?.issuetype?.subtask).map(issue => ({
    id: issue.id,
    key: issue.key,
    billable: billableKey ? parseBillableValue(issue.fields[billableKey]) : false,
    fields: {
      summary: issue.fields.summary || '',
      status: { name: issue.fields.status?.name || '' },
      issuetype: { name: issue.fields.issuetype?.name || '' },
      assignee: issue.fields.assignee || null,
      components: issue.fields.components || [],
      issuelinks: (issue.fields.issuelinks || []).map(l => {
        const linked = l.inwardIssue || l.outwardIssue
        if (!linked) return null
        return {
          key: linked.key,
          summary: linked.fields?.summary || '',
          status: linked.fields?.status?.name || '',
          type: l.type?.name || '',
        }
      }).filter(Boolean),
    },
    description: extractDescriptionText(issue.fields.description),
  }))
}

function extractDescriptionText(doc) {
  if (!doc || !doc.content) return ''
  const lines = []
  function walk(node) {
    if (node.type === 'text') { lines.push(node.text || ''); return }
    if (node.type === 'hardBreak') { lines.push('\n'); return }
    if (node.content) node.content.forEach(walk)
    if (['paragraph', 'bulletList', 'listItem', 'heading'].includes(node.type)) lines.push('\n')
  }
  doc.content.forEach(walk)
  return lines.join('').trim()
}

// Release-notes authoring is internal only. Clients keep read access to just
// three routes: /public/:token, /client-list and /:id/detail. Everything else
// (fetching Jira data, AI enhance, publishing arbitrary HTML, managing
// sections/clients) requires an internal role — this closes the vector where
// any authenticated user could host arbitrary HTML on /rn.
const CLIENT_OPEN_ROUTES = [
  { method: 'GET', re: /^\/public\// },
  { method: 'GET', re: /^\/client-list\/?$/ },
  { method: 'GET', re: /^\/\d+\/detail\/?$/ },
]
router.use((req, res, next) => {
  if (CLIENT_OPEN_ROUTES.some(r => r.method === req.method && r.re.test(req.path))) return next()
  if (!isAdminRole(getRole(req.userId))) return res.status(403).json({ error: 'Samo za interne korisnike' })
  next()
})

// ── Route: Task detail (summary + comments) ──────────────────────────────────

router.post('/task-detail', async (req, res) => {
  try {
    const { taskKey, projectId } = req.body
    if (!taskKey) return res.status(400).json({ error: 'taskKey je obavezan' })

    // With a project use its owner's Jira; without one (bare-JQL flow) use the
    // requesting user's own Jira credentials.
    let jira = null
    if (projectId) {
      const project = getProject(req.userId, projectId)
      if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
      jira = getOwnerJiraForProject(req.userId, projectId)
    } else {
      jira = getUserJira(req.userId) || getSuperAdminJira()
    }
    if (!jira) return res.status(422).json({ error: 'Jira konfiguracija nije podešena' })

    const { jiraGet } = await import('../jiraClient.js')
    const baseUrl = jira.jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const data = await jiraGet(
      jira.jiraUrl,
      `/issue/${taskKey}?fields=summary,description,comment`,
      jira.auth
    )

    const comments = (data.fields?.comment?.comments || [])
      .filter(c => c.body)
      .slice(-10) // last 10 comments
      .map(c => ({
        author: c.author?.displayName || 'Nepoznat',
        created: c.created,
        text: extractDescriptionText(c.body),
      }))

    res.json({
      key: data.key,
      summary: data.fields?.summary || '',
      description: extractDescriptionText(data.fields?.description),
      comments,
    })
  } catch (err) {
    console.error('task-detail error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Route 1: Fetch tasks ──────────────────────────────────────────────────────

router.post('/tasks', async (req, res) => {
  try {
    const { projectId, customJql } = req.body
    const hasJql = !!customJql?.trim()
    if (!projectId && !hasJql) return res.status(400).json({ error: 'Izaberi projekat ili unesi JQL' })

    // With a project we use its owner's Jira; with a bare JQL we use the
    // requesting user's own Jira credentials so they can pull anything.
    let project = null
    let jira = null
    if (projectId) {
      project = getProject(req.userId, projectId)
      if (!project) return res.status(404).json({ error: 'Projekat nije pronađen' })
      jira = getOwnerJiraForProject(req.userId, projectId)
    } else {
      jira = getUserJira(req.userId) || getSuperAdminJira()
    }
    if (!jira) return res.status(422).json({ error: 'Jira konfiguracija nije podešena' })

    const tasks = await fetchTasksForProject(jira, project, customJql)
    res.json({ tasks, projectName: project?.display_name || project?.epic_key || 'JQL' })
  } catch (err) {
    console.error('releaseNotes /tasks error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Route: JQL field value suggestions (for quick-filter dropdowns) ───────────
router.post('/field-suggestions', async (req, res) => {
  try {
    const { projectId, fieldName, query } = req.body
    if (!fieldName) return res.status(400).json({ error: 'fieldName je obavezan' })
    const jira = projectId ? getOwnerJiraForProject(req.userId, projectId) : (getUserJira(req.userId) || getSuperAdminJira())
    if (!jira) return res.status(422).json({ error: 'Jira konfiguracija nije podešena' })
    const { jiraGet } = await import('../jiraClient.js')
    const params = new URLSearchParams({ fieldName })
    if (query) params.set('fieldValue', query)
    const data = await jiraGet(jira.jiraUrl, `/jql/autocompletedata/suggestions?${params.toString()}`, jira.auth)
    const results = (data.results || []).map(r => ({
      value: r.value,
      label: (r.displayName || r.value || '').replace(/<\/?b>/gi, ''),
    }))
    res.json({ results })
  } catch (err) {
    console.error('field-suggestions error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Route 2: Export DOCX ──────────────────────────────────────────────────────

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const TABLE_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideH: NO_BORDER, insideV: NO_BORDER }

function makeParagraphs(markdown) {
  // Very simple markdown parser: headings, bullet lists, bold, plain text
  const paragraphs = []
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(4),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
      }))
    } else if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(3),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      }))
    } else if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text: line.slice(2),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 160 },
      }))
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const runs = parseInline(line.slice(2))
      paragraphs.push(new Paragraph({ children: runs, bullet: { level: 0 }, spacing: { after: 60 } }))
    } else if (line.trim() === '') {
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 120 } }))
    } else {
      const runs = parseInline(line)
      paragraphs.push(new Paragraph({ children: runs, spacing: { after: 80 } }))
    }
    i++
  }

  return paragraphs
}

function parseInline(text) {
  const runs = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), size: 22, font: 'Calibri' }))
    if (m[1] !== undefined) runs.push(new TextRun({ text: m[1], bold: true, size: 22, font: 'Calibri' }))
    else if (m[2] !== undefined) runs.push(new TextRun({ text: m[2], italics: true, size: 22, font: 'Calibri' }))
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), size: 22, font: 'Calibri' }))
  return runs.length ? runs : [new TextRun({ text, size: 22, font: 'Calibri' })]
}

function infoTableCell(text, bold = false) {
  return new TableCell({
    borders: TABLE_BORDERS,
    children: [new Paragraph({
      children: [new TextRun({ text, bold, size: 20, font: 'Calibri' })],
    })],
    width: { size: 50, type: WidthType.PERCENTAGE },
  })
}

// ── Route: Export release notes as Excel ─────────────────────────────────────
// Payload: { title, clientName, version, date, sections: [{ label, tasks:
// [{ key, name, text, helpLinks: [{ key, summary }] }] }] }
router.post('/export/xlsx', async (req, res) => {
  try {
    const { title = 'Release Notes', clientName = '', version = '', date = '', sections = [] } = req.body
    if (!Array.isArray(sections) || !sections.length) return res.status(400).json({ error: 'sections je obavezan' })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Release Notes', { views: [{ showGridLines: false }] })
    ws.columns = [
      { width: 14 },  // key
      { width: 46 },  // name
      { width: 84 },  // description
      { width: 40 },  // help desk
    ]

    const NAVY = 'FF0F2746'
    const CYAN = 'FF38BDF8'
    const font = (o = {}) => ({ name: 'Calibri', size: 11, ...o })

    // Header block
    ws.mergeCells('A1:D1')
    const h1 = ws.getCell('A1')
    h1.value = 'INTELISALE — Release Notes'
    h1.font = font({ size: 18, bold: true, color: { argb: 'FFFFFFFF' } })
    h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    h1.alignment = { vertical: 'middle', indent: 1 }
    ws.getRow(1).height = 34

    ws.mergeCells('A2:D2')
    const h2 = ws.getCell('A2')
    h2.value = [clientName, version, date].filter(Boolean).join('  ·  ')
    h2.font = font({ size: 12, bold: true, color: { argb: 'FF0F2746' } })
    h2.alignment = { vertical: 'middle', indent: 1 }
    ws.getRow(2).height = 22

    let r = 4
    for (const sec of sections) {
      // Section heading
      ws.mergeCells(`A${r}:D${r}`)
      const sc = ws.getCell(`A${r}`)
      sc.value = sec.label || ''
      sc.font = font({ size: 13, bold: true, color: { argb: NAVY } })
      sc.border = { bottom: { style: 'medium', color: { argb: CYAN } } }
      ws.getRow(r).height = 24
      r++

      // Table header
      const heads = ['Ključ', 'Naziv', 'Opis', 'Help desk']
      heads.forEach((t2, i) => {
        const c = ws.getCell(r, i + 1)
        c.value = t2
        c.font = font({ size: 10, bold: true, color: { argb: 'FF5A6480' } })
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F2F8' } }
      })
      r++

      for (const task of (sec.tasks || [])) {
        const help = (task.helpLinks || []).map(l => l.summary ? `${l.key} — ${l.summary}` : l.key).join('\n')
        const cells = [task.key || '', task.name || '', task.text || '', help]
        cells.forEach((v, i) => {
          const c = ws.getCell(r, i + 1)
          c.value = v
          c.font = font(i === 0 ? { color: { argb: 'FF2563EB' }, bold: true } : {})
          c.alignment = { vertical: 'top', wrapText: i >= 1 }
          c.border = { bottom: { style: 'thin', color: { argb: 'FFE2E6F0' } } }
        })
        // rough auto-height for wrapped description
        const lines = Math.max(1, Math.ceil((task.text || '').length / 110), ((task.text || '').match(/\n/g) || []).length + 1)
        ws.getRow(r).height = Math.min(15 * lines + 6, 220)
        r++
      }
      r++ // gap between sections
    }

    const safe = String(title).replace(/[\\/:*?"<>|]/g, '-')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safe)}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('release-notes xlsx error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/export/docx', async (req, res) => {
  try {
    const { projectName, version, date, preparedBy, content } = req.body
    if (!content) return res.status(400).json({ error: 'content je obavezan' })

    const bodyParagraphs = makeParagraphs(content)

    const doc = new Document({
      creator: 'Jira Tracker',
      title: `Release Notes — ${projectName || 'Projekat'}`,
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22 } },
        },
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            next: 'Normal',
            run: { bold: true, size: 32, color: '1A1A2E', font: 'Calibri' },
            paragraph: { spacing: { before: 400, after: 160 } },
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            basedOn: 'Normal',
            next: 'Normal',
            run: { bold: true, size: 26, color: '2563EB', font: 'Calibri' },
            paragraph: { spacing: { before: 300, after: 120 } },
          },
          {
            id: 'Heading3',
            name: 'Heading 3',
            basedOn: 'Normal',
            next: 'Normal',
            run: { bold: true, size: 24, color: '374151', font: 'Calibri' },
            paragraph: { spacing: { before: 200, after: 80 } },
          },
        ],
      },
      sections: [{
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // ~2cm
          },
        },
        children: [
          // ── Header: INTELISALE logo text + title ──
          new Paragraph({
            children: [new TextRun({ text: 'INTELISALE', bold: true, size: 40, color: '2563EB', font: 'Calibri' })],
            alignment: AlignmentType.LEFT,
            spacing: { after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Release Notes', size: 36, color: '374151', font: 'Calibri' })],
            alignment: AlignmentType.LEFT,
            spacing: { after: 400 },
          }),

          // ── Info table (4 rows, no borders) ──
          new Table({
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: TABLE_BORDERS,
            rows: [
              new TableRow({ children: [infoTableCell('Projekat', true), infoTableCell(projectName || '')] }),
              new TableRow({ children: [infoTableCell('Verzija', true), infoTableCell(version || '')] }),
              new TableRow({ children: [infoTableCell('Datum', true), infoTableCell(date || '')] }),
              new TableRow({ children: [infoTableCell('Pripremio', true), infoTableCell(preparedBy || '')] }),
            ],
          }),

          new Paragraph({ text: '', spacing: { after: 400 } }),

          // ── Body content ──
          ...bodyParagraphs,

          new Paragraph({ text: '', spacing: { after: 600 } }),

          // ── Footer ──
          new Paragraph({
            children: [new TextRun({ text: '─────────────────────────────────────────', color: 'CCCCCC', size: 16, font: 'Calibri' })],
            spacing: { before: 400, after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Generisano putem Jira Tracker · intelisale.com', size: 16, color: '9CA3AF', font: 'Calibri' })],
          }),
        ],
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const filename = `release-notes-${(projectName || 'projekat').replace(/\s+/g, '-').toLowerCase()}-${(version || 'v1').replace(/\s+/g, '')}.docx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (err) {
    console.error('releaseNotes /export/docx error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Route 3: AI enhance ───────────────────────────────────────────────────────

const AI_PROMPTS = {
  summarize: (text) => `Ti si tehnički pisac. Rezimiri sledeći sadržaj release notes-a u jasne, kratke tačke koje su razumljive i tehničkim i netehničkim korisnicima. Zadrži strukturu ako postoji.\n\n${text}`,
  simplify: (text) => `Ti si tehnički pisac. Uprosti sledeći tekst release notes-a tako da ga mogu razumeti i korisnici koji nisu tehnički. Izbegavaj žargon, koristi jasne i kratke rečenice.\n\n${text}`,
  translate_sr: (text) => `Prevedi sledeći tekst na srpski jezik (latinica). Zadrži formatiranje (Markdown, bullet liste, naslovi).\n\n${text}`,
  translate_en: (text) => `Translate the following text to English. Keep the exact same labels and structure (e.g. Summary:, Description:, Image1:, etc.) — only translate the values after the colon. Do not add any explanation or extra text.\n\n${text}`,
  generate_description: (text) => `# ULOGA
Ti si senior product manager u kompaniji Intelisale. Pišeš release notes namenjene
klijentima — poslovnim korisnicima koji nisu tehnička lica i koje zanima šta se za
njih konkretno promenilo.

# ZADATAK
Na osnovu unetog sadržaja (naziv taska, originalni Jira opis, subtaskovi i relevantni
komentari) napiši opis implementirane promene koji klijent može da pročita i odmah
razume šta dobija.

# PRE PISANJA (interno, ne ispisuj)
1. Odredi tip promene: nova funkcionalnost, poboljšanje postojećeg, ili ispravka
   greške (bug fix).
2. Izdvoj samo ono što je relevantno za klijenta. Zanemari interni sadržaj: imena
   developera, ID-eve tiketa, story points, acceptance criteria, tehničke napomene,
   linkove, reference na screenshot-ove.
3. Formuliši poslovnu korist: šta klijent sada može da uradi i zašto mu to pomaže.
4. Komentare tretiraj kao pomoćni kontekst, ne kao primarni izvor. Koristi ih samo
   da razjasniš kako finalna funkcionalnost izgleda. Kada se komentari međusobno
   razlikuju, prednost daj najnovijem i usklađenom sa opisom. Ignoriši interno
   ćaskanje, @pominjanja, blokere i QA napomene.

# PRAVILA
- Jezik je srpski, ekavica, latinica. NE koristi hrvatske reči i oblike: piši
  „trougao" (ne „trokut"), „prilagođavanje" (ne „prilagodba"), „nedelja" (ne
  „tjedan"), „hiljada" (ne „tisuća"), „izveštaj" (ne „izvješće"). Koristi
  standardni srpski jezik.
- Opisuj ISKLJUČIVO ono što klijent vidi i koristi u samoj aplikaciji. NE
  predstavljaj internu ili backend konfiguraciju kao mogućnost koju klijent radi
  sam. Ne pominji: app settings, „podešavanja u podacima aplikacije", kod,
  mapiranja, bazu, administraciju sistema. Ako je nešto interno konfigurabilno,
  to NIJE korist za klijenta — izostavi to.
- Oslanjaj se ISKLJUČIVO na uneti sadržaj. Ne izmišljaj funkcionalnosti, brojeve,
  nazive ekrana, dugmadi ni detalje kojih nema u ulazu. Ako je ulaz štur, napiši
  kratak ali tačan opis bez nagađanja.
- Ako se komentar kosi sa opisom ili deluje kao prevaziđena/odbačena odluka, ne
  opisuj ga. Opisuj samo ono što odgovara finalnom isporučenom stanju.
- Prilagodi formulaciju tipu promene:
  - Nova funkcionalnost / poboljšanje: opiši šta je sada omogućeno i koja je korist
    (npr. „Dodata je mogućnost...", „Omogućeno je...").
  - Ispravka greške: opiši šta je ispravljeno, bez okrivljavanja i bez tehničkog
    opisa uzroka (npr. „Otklonjen je problem zbog kog...").
- Fokus na poslovnoj koristi; tehničke detalje pominji samo kada su neophodni za
  razumevanje.
- Ton: profesionalan, jasan, neutralan. Bez marketinškog preuveličavanja i fraza
  tipa „revolucionarno", „moćno", „bez napora", „jednostavno".
- Ne ponavljaj doslovno naziv taska kao prvu rečenicu.
- Ne otkrivaj interne informacije (imena kolega, procene, sprintove, alate).

# DUŽINA I FORMAT
- Jedna promena: 2–5 rečenica, bez liste.
- Više odvojenih promena (npr. više subtaskova): kratak uvodni pasus (1–2 rečenice),
  pa svaka promena kao stavka liste; svaki red počinje sa „- ".

# IZLAZ
Odgovori SAMO opisom — bez naslova, uvoda, objašnjenja, navodnika oko celog odgovora
ni potpisa. Ne ponavljaj „##" oznake iz ulaza.

# PRIMERI

Ulaz:
## Naziv taska: Filtriranje liste porudžbina po statusu
## Opis (Jira): Korisnici žele da na pregledu porudžbina prikažu samo porudžbine
određenog statusa (u obradi, isporučeno, otkazano).
## Subtaskovi: nema
## Relevantni komentari: nema

Izlaz:
Na pregledu porudžbina sada je moguće filtrirati prikaz po statusu, pa se lako
izdvajaju porudžbine koje su u obradi, isporučene ili otkazane. Time se brže pronalaze
porudžbine koje zahtevaju pažnju, bez ručnog pretraživanja celog spiska.

---

Ulaz:
## Naziv taska: Ispravka pogrešnog obračuna troška dostave za porudžbine preko 4000 RSD
## Opis (Jira): nema
## Subtaskovi: nema
## Relevantni komentari: Potvrđeno na testu — trošak se sada obračunava tačno za sve
iznose preko praga.

Izlaz:
Otklonjen je problem zbog kog se trošak dostave u pojedinim slučajevima nije ispravno
obračunavao za porudžbine preko 4000 RSD. Iznos dostave se sada prikazuje tačno, u
skladu sa važećim pravilima.

---

Ulaz:
## Naziv taska: Unapređenja na modulu za reklamacije
## Opis (Jira): nema
## Subtaskovi:
- Dodato polje za napomenu pri kreiranju reklamacije
- Omogućeno preuzimanje reklamacije u PDF formatu
- Obaveštenje mejlom pri promeni statusa reklamacije
## Relevantni komentari: Dogovoreno da napomena nije obavezno polje.

Izlaz:
Modul za reklamacije dobio je nekoliko poboljšanja koja olakšavaju rad sa zahtevima:
- Pri kreiranju reklamacije sada je moguće uneti dodatnu napomenu.
- Reklamaciju je moguće preuzeti u PDF formatu.
- Pri svakoj promeni statusa reklamacije šalje se obaveštenje mejlom.

# UNETI SADRŽAJ:

${text}`,
}

router.post('/ai-enhance', async (req, res) => {
  try {
    const { content, action } = req.body
    if (!content?.trim()) return res.status(400).json({ error: 'content je obavezan' })
    if (!AI_PROMPTS[action]) return res.status(400).json({ error: `Nepoznata akcija: ${action}. Dozvoljeno: ${Object.keys(AI_PROMPTS).join(', ')}` })

    // Key resolution: user's own → any super-admin's (shared workspace) → env
    const userRow = db.prepare('SELECT anthropic_key FROM users WHERE id = ?').get(req.userId)
    const saRow = userRow?.anthropic_key ? null : db.prepare("SELECT anthropic_key FROM users WHERE role = 'super_admin' AND anthropic_key IS NOT NULL LIMIT 1").get()
    const apiKey = userRow?.anthropic_key ? decryptToken(userRow.anthropic_key)
      : saRow?.anthropic_key ? decryptToken(saRow.anthropic_key)
      : process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(503).json({ aiAvailable: false, error: 'Anthropic API ključ nije podešen' })

    const anthropic = new Anthropic({ apiKey, maxRetries: 4 })
    const messages = [{ role: 'user', content: AI_PROMPTS[action](content) }]
    const isOverloaded = e => e?.status === 529 || /overloaded/i.test(e?.message || '')

    // Opus is preferred; if Anthropic is overloaded (529) even after SDK retries,
    // fall back to Sonnet (more capacity). Other errors surface immediately.
    let message, lastErr
    for (const model of ['claude-opus-4-8', 'claude-sonnet-4-6']) {
      try {
        message = await anthropic.messages.create({ model, max_tokens: 2048, messages })
        break
      } catch (e) {
        lastErr = e
        if (!isOverloaded(e)) throw e
      }
    }
    if (!message) throw lastErr

    const result = message.content?.[0]?.text || ''
    res.json({ result })
  } catch (err) {
    console.error('releaseNotes /ai-enhance error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Route: Sections CRUD ─────────────────────────────────────────────────────

router.get('/sections', (req, res) => {
  try {
    const sections = db.prepare('SELECT id, name, position FROM release_note_sections WHERE user_id = ? ORDER BY position ASC, name ASC').all(req.userId)
    res.json({ sections })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/sections', (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name je obavezan' })
    const maxPos = db.prepare('SELECT MAX(position) as m FROM release_note_sections WHERE user_id = ?').get(req.userId)
    const position = (maxPos?.m ?? -1) + 1
    const result = db.prepare('INSERT INTO release_note_sections (user_id, name, position) VALUES (?, ?, ?)').run(req.userId, name.trim(), position)
    res.json({ id: result.lastInsertRowid, name: name.trim(), position })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/sections/:id', (req, res) => {
  try {
    const sec = db.prepare('SELECT id FROM release_note_sections WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!sec) return res.status(404).json({ error: 'Nije pronađeno' })
    db.prepare('DELETE FROM release_note_sections WHERE id = ?').run(sec.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Route: Publish ────────────────────────────────────────────────────────────

router.post('/publish', (req, res) => {
  try {
    const { html: rawHtml, title, projectId, version, sectionId } = req.body
    if (!rawHtml?.trim()) return res.status(400).json({ error: 'html je obavezan' })
    // Serverska sanitizacija — klijentska (RichBodyEditor) se zaobilazi direktnim POST-om.
    const html = sanitizePublishedHtml(rawHtml)

    const token = randomBytes(16).toString('hex')

    // Resolve sectionId: if a string name is passed, find or create the section
    let resolvedSectionId = sectionId || null
    if (!resolvedSectionId && req.body.sectionName?.trim()) {
      const existing = db.prepare('SELECT id FROM release_note_sections WHERE user_id = ? AND name = ?').get(req.userId, req.body.sectionName.trim())
      if (existing) {
        resolvedSectionId = existing.id
      } else {
        const maxPos = db.prepare('SELECT MAX(position) as m FROM release_note_sections WHERE user_id = ?').get(req.userId)
        const position = (maxPos?.m ?? -1) + 1
        const result = db.prepare('INSERT INTO release_note_sections (user_id, name, position) VALUES (?, ?, ?)').run(req.userId, req.body.sectionName.trim(), position)
        resolvedSectionId = result.lastInsertRowid
      }
    }

    db.prepare('INSERT INTO published_notes (token, project_id, user_id, title, version, html, section_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(token, projectId || null, req.userId, title || null, version || null, html, resolvedSectionId)

    // Auto-populate clients from project on publish
    if (projectId) {
      const projectClients = db.prepare(
        'SELECT client_user_id FROM project_clients WHERE project_id = ?'
      ).all(projectId)
      const insertClient = db.prepare(
        'INSERT OR IGNORE INTO release_note_clients (note_id, client_user_id) VALUES (?, ?)'
      )
      const noteRow = db.prepare('SELECT id FROM published_notes WHERE token = ?').get(token)
      if (noteRow) {
        for (const pc of projectClients) {
          insertClient.run(noteRow.id, pc.client_user_id)
        }
      }
    }

    const noteRow = db.prepare('SELECT id FROM published_notes WHERE token = ?').get(token)
    logAudit(req.userId, 'releasenote.publish', `note id=${noteRow?.id}, projekat=${projectId || '-'}, verzija=${version || '-'}`, req)
    res.json({ token, id: noteRow?.id, updated: false })
  } catch (err) {
    console.error('publish error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Public view (no auth) ─────────────────────────────────────────────────────

router.get('/public/:token', (req, res) => {
  const row = db.prepare('SELECT html, title FROM published_notes WHERE token = ?').get(req.params.token)
  if (!row) return res.status(404).send('<h1>Not found</h1>')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  setPublishedSecurityHeaders(res)
  res.send(preparePublishedHtml(row.html))
})

// ── Route: List notes (admin) ─────────────────────────────────────────────────

router.get('/list', (req, res) => {
  try {
    const notes = db.prepare(`
      SELECT pn.id, pn.token, pn.title, pn.version, pn.status, pn.created_at, pn.updated_at, pn.released_at, pn.project_id,
             p.display_name as project_name, p.epic_key,
             pn.section_id, rns.name as section_name,
             (SELECT COUNT(*) FROM release_note_clients WHERE note_id = pn.id) as client_count
      FROM published_notes pn
      LEFT JOIN projects p ON p.id = pn.project_id
      LEFT JOIN release_note_sections rns ON rns.id = pn.section_id
      WHERE pn.user_id = ?
      ORDER BY pn.created_at DESC
    `).all(req.userId)
    res.json({ notes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Route: List notes for client ──────────────────────────────────────────────

router.get('/client-list', (req, res) => {
  try {
    const notes = db.prepare(`
      SELECT pn.id, pn.token, pn.title, pn.version, pn.status, pn.created_at, pn.released_at, pn.project_id,
             p.display_name as project_name, p.epic_key,
             pn.section_id, rns.name as section_name
      FROM release_note_clients rnc
      JOIN published_notes pn ON pn.id = rnc.note_id
      LEFT JOIN projects p ON p.id = pn.project_id
      LEFT JOIN release_note_sections rns ON rns.id = pn.section_id
      WHERE rnc.client_user_id = ?
      ORDER BY pn.created_at DESC
    `).all(req.userId)
    res.json({ notes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Route: Get single note detail (admin + client) ───────────────────────────

router.get('/:id/detail', (req, res) => {
  try {
    const role = getRole(req.userId)
    let note
    if (role === 'user') {
      note = db.prepare(`
        SELECT pn.id, pn.token, pn.title, pn.version, pn.status, pn.created_at, pn.released_at, pn.html,
               p.display_name as project_name, p.epic_key
        FROM release_note_clients rnc
        JOIN published_notes pn ON pn.id = rnc.note_id
        LEFT JOIN projects p ON p.id = pn.project_id
        WHERE rnc.client_user_id = ? AND pn.id = ?
      `).get(req.userId, req.params.id)
    } else {
      note = db.prepare(`
        SELECT pn.id, pn.token, pn.title, pn.version, pn.status, pn.created_at, pn.released_at, pn.html,
               p.display_name as project_name, p.epic_key,
               (SELECT COUNT(*) FROM release_note_clients WHERE note_id = pn.id) as client_count
        FROM published_notes pn
        LEFT JOIN projects p ON p.id = pn.project_id
        WHERE pn.id = ? AND pn.user_id = ?
      `).get(req.params.id, req.userId)
    }
    if (!note) return res.status(404).json({ error: 'Nije pronađeno' })
    res.json({ note })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Route: Get clients for a note ─────────────────────────────────────────────

router.get('/:id/clients', (req, res) => {
  try {
    const note = db.prepare('SELECT id FROM published_notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!note) return res.status(404).json({ error: 'Nije pronađeno' })
    const clients = db.prepare(`
      SELECT u.id, u.name, u.email FROM release_note_clients rnc
      JOIN users u ON u.id = rnc.client_user_id
      WHERE rnc.note_id = ?
    `).all(note.id)
    res.json({ clients })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Route: Set clients for a note ─────────────────────────────────────────────

router.put('/:id/clients', (req, res) => {
  try {
    const { clientIds } = req.body // array of user IDs
    const note = db.prepare('SELECT id FROM published_notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!note) return res.status(404).json({ error: 'Nije pronađeno' })

    db.prepare('DELETE FROM release_note_clients WHERE note_id = ?').run(note.id)
    const insert = db.prepare('INSERT OR IGNORE INTO release_note_clients (note_id, client_user_id) VALUES (?, ?)')
    for (const cid of (clientIds || [])) insert.run(note.id, cid)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Route: Mark as released ───────────────────────────────────────────────────

router.put('/:id/release', (req, res) => {
  try {
    const note = db.prepare('SELECT id FROM published_notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!note) return res.status(404).json({ error: 'Nije pronađeno' })
    db.prepare('UPDATE published_notes SET status = ?, released_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('released', note.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Route: Delete note ────────────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  try {
    const note = db.prepare('SELECT id FROM published_notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!note) return res.status(404).json({ error: 'Nije pronađeno' })
    db.prepare('DELETE FROM published_notes WHERE id = ?').run(note.id)
    logAudit(req.userId, 'releasenote.delete', `note id=${note.id}`, req)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
