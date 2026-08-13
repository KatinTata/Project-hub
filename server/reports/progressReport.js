// P3-2: automatski izveštaj o napretku projekta. Izvor podataka je LOKALNA
// baza (project_snapshots, published_notes, messages, phases) — bez Jira
// poziva, pa je generisanje jeftino i pouzdano. Dva profila istog generatora:
//   'client'   → bez internih sati/procena (politika 1.3, default)
//   'internal' → pun set (estimacije, utrošeno, preostalo, billable)

import db from '../db.js'

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const H = sec => Math.round(((sec || 0) / 3600) * 10) / 10
const fmtD = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`
}

function snapshotAt(projectId, maxDay) {
  const row = db.prepare(
    'SELECT day, payload FROM project_snapshots WHERE project_id = ? AND day <= ? ORDER BY day DESC LIMIT 1'
  ).get(projectId, maxDay)
  if (!row) return null
  try { return { day: row.day, ...JSON.parse(row.payload) } } catch { return null }
}

export function buildProgressReportData(projectId, { periodStart, periodEnd, profile = 'client' }) {
  const project = db.prepare(`
    SELECT p.*, u.name AS owner_name, u.email AS owner_email
    FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(projectId)
  if (!project) return null

  const current = snapshotAt(projectId, periodEnd)
  const previous = snapshotAt(projectId, periodStart)

  const releases = db.prepare(`
    SELECT id, title, version, status, created_at, released_at
    FROM published_notes
    WHERE project_id = ? AND created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
  `).all(projectId, periodStart, periodEnd + ' 23:59:59')

  const messagesInPeriod = db.prepare(`
    SELECT COUNT(*) AS n FROM messages
    WHERE project_id = ? AND created_at >= ? AND created_at <= ?
  `).get(projectId, periodStart, periodEnd + ' 23:59:59').n

  const phases = db.prepare(`
    SELECT ph.name, ph.due_date,
      (SELECT COUNT(*) FROM phase_tasks pt WHERE pt.phase_id = ph.id) AS task_count
    FROM phases ph WHERE ph.project_id = ? ORDER BY ph.position, ph.id
  `).all(projectId)
  const today = new Date().toISOString().slice(0, 10)
  const nextPhase = phases.filter(p => p.due_date && p.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] || null

  const clients = db.prepare(`
    SELECT u.name, u.email FROM project_clients pc JOIN users u ON u.id = pc.client_user_id
    WHERE pc.project_id = ?
  `).all(projectId)

  return {
    profile,
    project: { id: project.id, name: project.display_name || project.epic_key, ownerName: project.owner_name, ownerEmail: project.owner_email },
    period: { start: periodStart, end: periodEnd },
    current, previous, releases, messagesInPeriod, nextPhase, clients,
  }
}

function progressBlock(label, cur, prev) {
  const pct = cur && cur.total > 0 ? Math.round((cur.done / cur.total) * 100) : 0
  const prevPct = prev && prev.total > 0 ? Math.round((prev.done / prev.total) * 100) : null
  const delta = prevPct != null ? pct - prevPct : null
  const deltaStr = delta == null ? '' : delta === 0 ? ' (bez promene)' : ` (${delta > 0 ? '+' : ''}${delta} pp u periodu)`
  return `
    <div style="margin-bottom:6px;font-size:12px;color:#5A6480;letter-spacing:0.06em;text-transform:uppercase">${esc(label)}</div>
    <div style="height:12px;border-radius:6px;background:#E2E6F0;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:#2563EB"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;color:#5A6480;margin-top:6px">
      <span>${cur ? `${cur.done} od ${cur.total} stavki završeno${esc(deltaStr)}` : 'Nema snimljenog stanja za ovaj period'}</span>
      <strong style="color:#0F1523">${pct}%</strong>
    </div>`
}

export function renderProgressReportHtml(data) {
  const { profile, project, period, current, previous, releases, nextPhase } = data
  const isInternal = profile === 'internal'

  const releasesHtml = releases.length
    ? releases.map(r => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E6F0;font-weight:600">${esc(r.title || 'Release notes')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E6F0">${esc(r.version || '—')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E6F0">${fmtD(r.released_at || r.created_at)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;color:#5A6480">U ovom periodu nije bilo novih objava.</td></tr>`

  const internalHtml = isInternal && current ? `
    <h2 style="font-size:15px;margin:26px 0 10px;color:#0F2746;border-bottom:2px solid #38BDF8;padding-bottom:6px">Interni pregled (ne deli se sa klijentom)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 12px;color:#5A6480">Estimirano</td><td style="padding:6px 12px;text-align:right;font-weight:600">${H(current.totalEst)} h</td></tr>
      <tr><td style="padding:6px 12px;color:#5A6480">Utrošeno</td><td style="padding:6px 12px;text-align:right;font-weight:600">${H(current.totalSpent)} h${previous ? ` (${H(current.totalSpent - previous.totalSpent) >= 0 ? '+' : ''}${H(current.totalSpent - (previous.totalSpent || 0))} h u periodu)` : ''}</td></tr>
      <tr><td style="padding:6px 12px;color:#5A6480">Preostalo (procena)</td><td style="padding:6px 12px;text-align:right;font-weight:600">${H(current.remainingEst)} h</td></tr>
      <tr><td style="padding:6px 12px;color:#5A6480">Naplativo utrošeno</td><td style="padding:6px 12px;text-align:right;font-weight:600">${H(current.billableSpent)} h</td></tr>
    </table>` : ''

  const statusRow = current ? `
    <div style="display:flex;gap:28px;margin-top:16px;flex-wrap:wrap">
      <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">ZAVRŠENO</div><div style="font-size:18px;font-weight:700">${current.done}</div></div>
      <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">U RADU</div><div style="font-size:18px;font-weight:700">${current.inprog + (current.testing || 0)}</div></div>
      <div><div style="font-size:10px;color:#7DD3FC;letter-spacing:0.1em">PREOSTALO</div><div style="font-size:18px;font-weight:700">${(current.todo || 0) + (current.unknown || 0)}</div></div>
    </div>` : ''

  return `<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8"><title>Izveštaj — ${esc(project.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:24px;background:#F0F2F8;font-family:'Hanken Grotesk','Segoe UI',Arial,sans-serif;color:#0F1523">
  <div style="max-width:680px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#0b1a2f 0%,#0f2746 55%,#163e6b 100%);border-radius:16px;padding:26px 28px;color:#fff">
      <div style="font-size:11px;letter-spacing:0.16em;color:#38BDF8;margin-bottom:10px">INTELISALE &middot; IZVEŠTAJ O NAPRETKU${isInternal ? ' &middot; INTERNO' : ''}</div>
      <div style="font-size:22px;font-weight:800;line-height:1.25">${esc(project.name)}</div>
      <div style="font-size:13px;color:#9FB2C9;margin-top:8px">Period: ${fmtD(period.start)} — ${fmtD(period.end)}</div>
      ${statusRow}
    </div>

    <div style="background:#fff;border:1px solid #E2E6F0;border-radius:12px;padding:20px 24px;margin-top:14px">
      ${progressBlock('Napredak projekta', current, previous)}
    </div>

    <div style="background:#fff;border:1px solid #E2E6F0;border-radius:12px;padding:20px 24px;margin-top:14px">
      <h2 style="font-size:15px;margin:0 0 10px;color:#0F2746;border-bottom:2px solid #38BDF8;padding-bottom:6px">Objave u periodu</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr>
          <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#5A6480">Naslov</th>
          <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#5A6480">Verzija</th>
          <th style="text-align:left;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#5A6480">Datum</th>
        </tr></thead>
        <tbody>${releasesHtml}</tbody>
      </table>
      ${nextPhase ? `<p style="font-size:13px;color:#5A6480;margin:14px 0 0">Sledeći ključni datum: <strong style="color:#0F1523">${fmtD(nextPhase.due_date)}</strong> — ${esc(nextPhase.name)}</p>` : ''}
      ${internalHtml}
    </div>

    <div style="margin-top:20px;text-align:center;font-size:10px;color:#A0AABF;letter-spacing:0.1em">INTELISALE &middot; EMPOWERING SALES EXCELLENCE &middot; www.intelisale.com</div>
  </div>
</body></html>`
}
